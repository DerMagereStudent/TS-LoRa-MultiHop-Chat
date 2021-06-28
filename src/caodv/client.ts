import { valid } from "joi";
import { ATConfig } from "../at/cfg/atcfg";
import { PortConfig } from "../at/cfg/portcfg";
import { AtClient, AtLogType } from "../at/client";
import { AtCmdSend } from "../at/cmd/atcmdsend";
import { ByteUtils } from "../utils/byteutils";
import { Parsing } from "../utils/parsing";
import { CaodvRERR } from "./msgs/rerr";
import { CaodvRREP } from "./msgs/rrep";
import { RREPACK } from "./msgs/rrepack";
import { CaodvRREQ } from "./msgs/rreq";
import { CaodvSendHopAck } from "./msgs/sendhopack";
import { CaodvSendTextReq } from "./msgs/sendtextreq";
import { CaodvSendTextReqAck } from "./msgs/sendtextreqack";
import { CaodvParams } from "./params";

export class RoutingTableEntry {
    nextHop: number;
    hopCount: number;
    sequenceNumber: number;
    validSeq: boolean;
    precursors: Set<number>;
    expiringTime: number;
    valid: boolean;

    constructor(nextHop: number, hopCount: number, sequenceNumber: number, validSeq: boolean, precursors: Set<number>, expiringTime: number, valid: boolean) {
        this.nextHop = nextHop;
        this.hopCount = hopCount;
        this.sequenceNumber = sequenceNumber;
        this.validSeq = validSeq;
        this.precursors = precursors;
        this.expiringTime = expiringTime;
        this.valid = valid;
    }

    isValid(): boolean { return this.valid && this.expiringTime >= Date.now(); }
}

export class ClientInformation {
    broadcastID: number;
    msgSeqNumber: number;

    constructor(broadcastID: number, msgSeqNumber: number) {
        this.broadcastID = broadcastID;
        this.msgSeqNumber = msgSeqNumber;
    }
}

export class PendingPacket<T> {
    msg: T;
    tries: number;
    expiringTime: number;

    constructor(msg: T, tries: number, expiringTime: number) {
        this.msg = msg;
        this.tries = tries;
        this.expiringTime = expiringTime;
    }
}

export interface MsgHandler {
    (addr: number, msg: string): void;
}

export enum CaodvMsgLogType {
    Originated,
    Forwarded,
    Received
}

export class CaodvClient {
    client: AtClient;

    routingTable: Map<number, RoutingTableEntry>;
    clientInfo: Map<number, ClientInformation>;
    blacklist: Map<number, number> // Map dest to entry expiring datetime in ms

    pendingRequests: Map<number, PendingPacket<CaodvRREQ>>;
    pendingReplies: Map<number, PendingPacket<CaodvRREP>[]>;
    pendingMessages: { dest: number, msg: string }[];
    pendingTextReqs: PendingPacket<CaodvSendTextReq>[];
    pendingOriginatedTextReqs: PendingPacket<CaodvSendTextReq>[];

    msgHandlers: Map<number, MsgHandler> // Map msg type to corresponding handler function pointer.

    atLog: { msg: string, type: AtLogType }[];
    msgLog: { msg: string, type: CaodvMsgLogType }[];
    messages: Map<number, { msg: string, sent: boolean }[]>;

    addr: number;
    broadcastID: number;
    seqNumber: number;
    msgSeqNumber: number;

    constructor() {
        this.client = new AtClient();
        
        this.routingTable = new Map<number, RoutingTableEntry>();
        this.clientInfo = new Map<number, ClientInformation>();
        this.blacklist = new Map<number, number>();

        this.pendingRequests = new Map<number, PendingPacket<CaodvRREQ>>();
        this.pendingReplies = new Map<number, PendingPacket<CaodvRREP>[]>();
        this.pendingMessages = [];
        this.pendingTextReqs = [];
        this.pendingOriginatedTextReqs = [];

        this.atLog = [];
        this.msgLog = [];
        this.messages = new Map<number, { msg: string, sent: boolean }[]>();

        this.addr = 18;
        this.broadcastID = 0;
        this.seqNumber = 0;
        this.msgSeqNumber = 0;

        this.msgHandlers = new Map<number, MsgHandler>();
        this.msgHandlers.set(1, this.handleRREQ.bind(this));
        this.msgHandlers.set(2, this.handleRREP.bind(this));
        this.msgHandlers.set(3, this.handleRERR.bind(this));
        this.msgHandlers.set(4, this.handleRREPACK.bind(this));
        this.msgHandlers.set(5, this.handleSENDTEXTREQ.bind(this));
        this.msgHandlers.set(6, this.handleSENDHOPACK.bind(this));
        this.msgHandlers.set(7, this.handleSENDTEXTREQACK.bind(this));

        this.client.beginReceiveMsg(this.onMessage.bind(this));
        this.client.beginReceiveLog(this.onLog.bind(this));
    }

    start(): void {
        this.client.start(new PortConfig(), new ATConfig());
        setTimeout(this.maintenanceProc.bind(this), 20);
    }

    beginSend(dest: number, msg: string) {
        if (!this.routingTable.has(dest) || !this.routingTable.get(dest)!.isValid()) {
            this.pendingMessages.push({ dest: dest, msg: msg });
            this.requestRoute(dest);
        } else
            this.sendNewTextReq(dest, msg);
    }

    requestRoute(dest: number): void {
        // route is known and valid/expired or not already waiting for RREP
        if (this.routingTable.has(dest) && this.routingTable.get(dest)!.isValid() || this.pendingRequests.has(dest))
            return;

        // increment seq number and rreq id
        this.incrementSeqNumber();
        this.broadcastID = ByteUtils.inc(this.broadcastID);

        // create rreq
        var rreq: CaodvRREQ = new CaodvRREQ(
            !this.routingTable.has(dest) || !this.routingTable.get(dest)!.validSeq,
            0,
            this.broadcastID,
            this.addr,
            this.seqNumber,
            dest,
            this.routingTable.has(dest) ? this.routingTable.get(dest)!.sequenceNumber : 0
        );

        // buffer req
        this.pendingRequests.set(dest, new PendingPacket(rreq, 1, Date.now() + CaodvParams.TIMEOUT_RREQ));

        this.client.beginSend(new AtCmdSend(0, rreq.str()));
        this.log(rreq, CaodvMsgLogType.Originated, 0);
    }

    onRoute(dest: number) {
        this.pendingMessages.filter(e => e.dest == dest).forEach((e, index, map) => {
            if (!this.routingTable.has(dest) || !this.routingTable.get(dest)!.isValid())
                return;

            this.sendNewTextReq(dest, e.msg);
            this.pendingMessages.slice(index, 1);
        });
    }

    sendNewTextReq(dest: number, msg: string) {
        this.msgSeqNumber = ByteUtils.inc(this.msgSeqNumber);
            
        var textreq: CaodvSendTextReq = new CaodvSendTextReq(this.addr, dest, this.msgSeqNumber, msg);
        this.pendingTextReqs.push(new PendingPacket(textreq, 1, Date.now() + CaodvParams.TIMEOUT_ACK * this.routingTable.get(dest)!.hopCount));
        this.pendingOriginatedTextReqs.push(new PendingPacket(textreq, 1, Date.now() + CaodvParams.TIMEOUT_ACK * this.routingTable.get(dest)!.hopCount));
        this.client.beginSend(new AtCmdSend(this.routingTable.get(dest)!.nextHop, textreq.str()));
        this.log(textreq, CaodvMsgLogType.Originated, this.routingTable.get(dest)!.nextHop);
    }

    onMessage(addr: number, msg: string): void {
        if (msg.length == 0)
            return;

        var type: number = msg.charCodeAt(0);

        if (type <= 0 || type > 7)
            return;

        this.msgHandlers.get(type)!(addr, msg);
    }

    onLog(msg: string, type: AtLogType) {
        this.atLog.push({ msg: msg, type: type });
    }

    maintenanceProc(): void {
        // remove expired blacklist entries
        this.blacklist?.forEach((val, key, map) => {
            if (val < Date.now())
                this.blacklist.delete(key);
        });

        // check if route is invalid
        this.routingTable?.forEach((value, key, map) => {
            if (value.valid && !value.isValid())
                value.valid = false;
        });

        // check if rreq should be resent or exceeded max tries.
        this.pendingRequests?.forEach((value, key, map) => {
            if (value.expiringTime >= Date.now())
                return;

            if (value.tries === CaodvParams.MAX_TRIES) {
                this.pendingRequests.delete(key)
                this.pendingMessages = this.pendingMessages.filter(e => e.dest !== value.msg.destAddr); // Drop all messages with dest of failed rreq
            } else {
                var newRreq: CaodvRREQ = value.msg;
                newRreq.broadcastID++;
                newRreq.originSeqNumber = this.seqNumber;

                this.pendingRequests.set(key, new PendingPacket(newRreq, value.tries + 1, Date.now() + CaodvParams.TIMEOUT_RREQ));
                this.client.beginSend(new AtCmdSend(0, newRreq.str()));
                this.log(newRreq, CaodvMsgLogType.Originated, 0);
            }
        });

        // check if ack timeout
        this.pendingReplies?.forEach((value, key, map) => {
            var shouldClear: boolean = false;

            for (var i: number = 0; i < value.length; i++) {
                if (value[i].expiringTime >= Date.now())
                    continue;
                
                if (value[i].tries >= CaodvParams.MAX_TRIES) {
                    this.blacklistClient(key);
                    shouldClear = true;
                } else {
                    this.client.beginSend(new AtCmdSend(key, value[i].msg.str()));
                    value[i].tries++;
                    value[i].expiringTime = Date.now() + CaodvParams.TIMEOUT_ACK;
                    this.log(value[i].msg, value[i].msg.destAddr === this.addr ? CaodvMsgLogType.Originated : CaodvMsgLogType.Forwarded, key);
                }
            }
            
            if (shouldClear)
                this.pendingReplies.delete(key);
        });

        this.pendingTextReqs.forEach((value, index, array) => {
            if (value.expiringTime >= Date.now())
                return;

            if (value.tries >= CaodvParams.MAX_TRIES) {
                array.splice(index, 1);
                this.pendingOriginatedTextReqs = this.pendingOriginatedTextReqs.filter(e => !(e.msg.originAddr === value.msg.originAddr && e.msg.destAddr === value.msg.destAddr && e.msg.msgSeqNumber === value.msg.msgSeqNumber));

                // cannot reach node so invalidate route and send err
                var keysToInvalidate: number[] = [...this.routingTable.keys()].filter(key => this.routingTable.get(key)!.isValid() && (key === value.msg.destAddr || this.routingTable.get(key)!.nextHop === value.msg.destAddr));
                this.sendRERR(keysToInvalidate);
                console.log(keysToInvalidate);

                return;
            }

            if (!this.routingTable.has(value.msg.destAddr) || !this.routingTable.get(value.msg.destAddr)!.isValid()) {
                array.splice(index, 1);
                return;
            }

            var entry: RoutingTableEntry = this.routingTable.get(value.msg.destAddr)!;
            value.tries++;
            value.expiringTime = Date.now() + entry.hopCount * CaodvParams.TIMEOUT_ACK;
            this.client.beginSend(new AtCmdSend(entry.nextHop, value.msg.str()));
            this.log(value.msg, CaodvMsgLogType.Originated, entry.nextHop);
        });

        setTimeout(this.maintenanceProc.bind(this), 20);
    }

    //////////////////////////////////////// Msg handler section ////////////////////////////////////////
    handleRREQ(addr: number, msg: string): void {
        var rreq: CaodvRREQ | undefined = CaodvRREQ.parse(msg);

        if (rreq == null || this.clientIsBlacklisted(addr) || rreq.originAddr == this.addr)
            return;

        this.log(rreq, CaodvMsgLogType.Received, addr);

        // create reverse route to previous hop (addr)
        if (!this.routingTable.has(addr) || !this.routingTable.get(addr)!.isValid()) {
            this.routingTable.set(addr, new RoutingTableEntry(
                addr, 1, 0, false, new Set<number>(), Date.now() + CaodvParams.ROUTE_LIFETIME, false
            ));
        }

        // drop rreq if is not new
        if (this.routingTable.has(rreq.originAddr)) { // no client info means guaranteed to be new
            var diff: number = ByteUtils.subtract(rreq.originSeqNumber, this.routingTable.get(rreq.originAddr)!.sequenceNumber);
            
            if (
                diff < 0 ||                                                                                                 // newer origin seq number
                diff == 0 && this.clientInfo.has(rreq.originAddr) && ByteUtils.subtract(rreq.broadcastID, this.clientInfo.get(rreq.originAddr)!.broadcastID) <= 0    // same seq number but newer broadcast id
            ) return;
        }

        if (!this.clientInfo.has(rreq.originAddr))
            this.clientInfo.set(rreq.originAddr, new ClientInformation(rreq.broadcastID, 0));
        else
            this.clientInfo.get(rreq.originAddr)!.broadcastID = rreq.broadcastID;

        // increment rreq hop count
        rreq.hopCount++;

        // if no entry for origin, create entry
        if (!this.routingTable.has(rreq.originAddr)) {
            this.routingTable.set(rreq.originAddr, new RoutingTableEntry(
                addr, rreq.hopCount, rreq.originSeqNumber, true, new Set<number>(), Date.now() + CaodvParams.ROUTE_LIFETIME, true
            ));
        }
        // update entry if newer information
        else if (ByteUtils.subtract(rreq.originSeqNumber, this.routingTable.get(rreq.originAddr)!.sequenceNumber) > 0) {
            var entry: RoutingTableEntry = this.routingTable.get(rreq.originAddr)!;
            entry.sequenceNumber = rreq.originSeqNumber;
            entry.validSeq = true;
            entry.nextHop = addr;
            entry.hopCount = rreq.hopCount;
            entry.expiringTime = Date.now() + CaodvParams.ROUTE_LIFETIME;
            entry.valid = true;
        }

        // if this node cannot respond because no/invalid/expired information
        if (this.addr !== rreq.destAddr) {
            var currentStoredSeqNumber: number = !this.routingTable.has(rreq.destAddr) ? 0 : this.routingTable.get(rreq.destAddr)!.sequenceNumber;

            // change dest seq number to newer of either rreq.destSeqNumber or entry.seqNumber
            // TODO: 32-bit max with overflow or Math.max
            rreq.destSeqNumber = !this.routingTable.has(rreq.destAddr) || ByteUtils.subtract(rreq.destSeqNumber, currentStoredSeqNumber) >= 0 ? rreq.destSeqNumber : currentStoredSeqNumber;
            this.client.beginSend(new AtCmdSend(0, rreq.str()));
            this.log(rreq, CaodvMsgLogType.Forwarded, 0);
            return;
        }

        // basic rrep. every 0 gets replaced.
        var rrep: CaodvRREP = new CaodvRREP(0, rreq.originAddr, rreq.destAddr, 0, 0);

        //if (this.addr == rreq.destAddr) {
            if (!rreq.unknownSeq && rreq.destSeqNumber == this.incrementedSeqNumber())
                this.incrementSeqNumber(); 

            rrep.destSeqNumber = this.seqNumber;
            rrep.remainingLifeTime = CaodvParams.ROUTE_LIFETIME_S;
        //}
        // else {
        //     this.routingTable.get(rreq.destAddr)?.precursors.add(addr);
        //     this.routingTable.get(rreq.originAddr)?.precursors.add(this.routingTable.get(rreq.destAddr)!.nextHop); // TODO: ??? because we dont do gratuitous rrep this may be wrong.

        //     var destEntry: RoutingTableEntry = this.routingTable.get(rreq.destAddr)!;
        //     rrep.destSeqNumber = destEntry.sequenceNumber;
        //     rrep.hopCount = destEntry.hopCount;
        //     rrep.remainingLifeTime = Math.max(1, Math.round((destEntry.expiringTime - Date.now()) / 1000));
        // }

        this.client.beginSend(new AtCmdSend(addr, rrep.str()));

        if (!this.pendingReplies.has(addr))
            this,this.pendingReplies.set(addr, []);

        this.pendingReplies.get(addr)!.push(new PendingPacket(rrep, 1, Date.now() + CaodvParams.TIMEOUT_ACK));

        this.log(rrep, CaodvMsgLogType.Originated, addr);
    }

    handleRREP(addr: number, msg: string): void {
        var rrep: CaodvRREP | undefined = CaodvRREP.parse(msg);

        if (rrep == null)
            return;

        this.log(rrep, CaodvMsgLogType.Received, addr);

        // create route if no entry
        if (!this.routingTable.has(addr)) {
            this.routingTable.set(addr, new RoutingTableEntry(
                addr, 1, 0, false, new Set<number>(), Date.now() + CaodvParams.ROUTE_LIFETIME, true
            ));
        }

        rrep.hopCount++;

        var updated: boolean = false;
        // if no route to rrep.dest
        if (!this.routingTable.has(rrep.destAddr)) {
            this.routingTable.set(rrep.destAddr, new RoutingTableEntry(
                addr, rrep.hopCount, rrep.destSeqNumber, true, new Set<number>(), Date.now() + rrep.remainingLifeTime * 1000, true
            ));
            updated = true;
        } else if (
            !this.routingTable.get(rrep.destAddr)!.validSeq || // invalid seq number
            this.routingTable.get(rrep.destAddr)!.validSeq && ByteUtils.subtract(rrep.destAddr, this.routingTable.get(rrep.destAddr)!.sequenceNumber) > 0 || // valid seq number but rrep has newer
            rrep.destAddr === this.routingTable.get(rrep.destAddr)!.sequenceNumber && (!this.routingTable.get(rrep.destAddr)!.valid || rrep.hopCount < this.routingTable.get(rrep.destAddr)!.hopCount) // valid seq number 
        ) {
            this.routingTable.set(rrep.destAddr, new RoutingTableEntry(
                addr, rrep.hopCount, rrep.destSeqNumber, true, this.routingTable.get(rrep.destAddr)!.precursors, Date.now() + rrep.remainingLifeTime * 1000, true
            ));
            updated = true;
        }

        // if this node is not origin && the route to dest was created or updated && this node has a route to the rreq origin
        if (this.addr !== rrep.originAddr && updated && this.routingTable.has(rrep.originAddr)) { // TODO: Only when created or updated ???
            var nextHopToSrc: number = this.routingTable.get(rrep.originAddr)!.nextHop;
            this.client.beginSend(new AtCmdSend(nextHopToSrc, rrep.str()));
            // TODO: buffer rrep
            this.log(rrep, CaodvMsgLogType.Forwarded, nextHopToSrc);

            this.routingTable.get(rrep.destAddr)!.precursors.add(nextHopToSrc);
            this.routingTable.get(addr)?.precursors.add(nextHopToSrc); // TODO: RFC 6.7 last sentence. rrep.previousHop or destEntry.nextHop

            // send reply ack to previous hop
            this.client.beginSend(new AtCmdSend(addr, new RREPACK().str()));
            this.log(new RREPACK(), CaodvMsgLogType.Originated, addr);
        } else if (this.addr === rrep.originAddr && this.pendingRequests.has(rrep.destAddr)) {
            this.pendingRequests.delete(rrep.destAddr);

            // send reply ack to previous hop
            this.client.beginSend(new AtCmdSend(addr, new RREPACK().str()));
            this.log(new RREPACK(), CaodvMsgLogType.Originated, addr);

            this.onRoute(rrep!.destAddr);
        }
    }

    handleRREPACK(addr: number, msg: string): void {
        this.log(new RREPACK(), CaodvMsgLogType.Received, addr);

        if (this.pendingReplies.has(addr))
            this.pendingReplies.get(addr)!.shift(); // 
    }

    handleRERR(addr: number, msg: string): void {
        var rerr: CaodvRERR | undefined = CaodvRERR.parse(msg);

        if (rerr == null)
            return;

        this.log(rerr, CaodvMsgLogType.Received, addr);

        var keysToInvalidate: number[] = [...this.routingTable.keys()].filter(key => 
            this.routingTable.get(key)!.valid &&
            this.routingTable.get(key)!.nextHop === addr &&
            rerr!.unreachableInfo.find(e => e.addr == key) &&
            ByteUtils.subtract(rerr!.unreachableInfo.find(e => e.addr == key)!.seq, this.routingTable.get(key)!.sequenceNumber) >= 0
        );

        keysToInvalidate.forEach(key => {
            var entry: RoutingTableEntry = this.routingTable.get(key)!;
            entry.sequenceNumber = rerr!.unreachableInfo.find(e => e.addr == key)!.seq;
        });

        this.sendRERR(keysToInvalidate);
    }

    handleSENDTEXTREQ(addr: number, msg: string): void {
        var textreq: CaodvSendTextReq | undefined = CaodvSendTextReq.parse(msg);

        if (textreq == null)
            return;

        this.log(textreq, CaodvMsgLogType.Received, addr);

        if (textreq.originAddr === this.addr)
            return;

        // Drop text req if not new
        // if (this.clientInfo.has(textreq.originAddr)) { // if no entry guaranteed to be new
        //     if (ByteUtils.subtract(textreq.msgSeqNumber, this.clientInfo.get(textreq.originAddr)!.msgSeqNumber) <= 0)
        //         return;
        // }

        // update msg seq number for originator
        if (!this.clientInfo.has(textreq.originAddr))
            this.clientInfo.set(textreq.originAddr, new ClientInformation(0, textreq.msgSeqNumber));
        else
            this.clientInfo.get(textreq.originAddr)!.msgSeqNumber = textreq.msgSeqNumber;

        var hopAck: CaodvSendHopAck = new CaodvSendHopAck(textreq.msgSeqNumber);
        this.client.beginSend(new AtCmdSend(addr, hopAck.str()));
        this.log(hopAck, CaodvMsgLogType.Originated, addr);

        if (textreq.destAddr !== this.addr) {
            // Drop msg if no route or route is not active
            if (this.routingTable.has(textreq.destAddr) && this.routingTable.get(textreq.destAddr)!.valid) {
                this.client.beginSend(new AtCmdSend(this.routingTable.get(textreq.destAddr)!.nextHop, textreq.str()));
                this.log(textreq, CaodvMsgLogType.Forwarded, this.routingTable.get(textreq.destAddr)!.nextHop);
                this.validateActiveRoute(textreq.destAddr);
            }

            return;
        }

        var textreqack: CaodvSendTextReqAck = new CaodvSendTextReqAck(
            textreq.originAddr,
            textreq.destAddr,
            textreq.msgSeqNumber
        );

        this.client.beginSend(new AtCmdSend(addr, textreqack.str()));
        this.log(textreqack, CaodvMsgLogType.Originated, addr);

        this.validateActiveRoute(addr);
        
        if (!this.messages.has(textreq.originAddr))
            this.messages.set(textreq.originAddr, []);

        this.messages.get(textreq.originAddr)!.push({ msg: textreq.payload, sent: false });
    }

    handleSENDHOPACK(addr: number, msg: string): void {
        var hopAck: CaodvSendHopAck | undefined = CaodvSendHopAck.parse(msg);

        if (hopAck == null)
            return;

        this.log(hopAck, CaodvMsgLogType.Received, addr);
        this.pendingTextReqs = this.pendingTextReqs.filter(e => e.msg.msgSeqNumber !== hopAck?.msgSeqNumber);
    }

    handleSENDTEXTREQACK(addr: number, msg: string): void {
        var textReqAck: CaodvSendTextReqAck | undefined = CaodvSendTextReqAck.parse(msg);

        if (textReqAck == null)
            return;

        this.log(textReqAck, CaodvMsgLogType.Received, addr);

        if (textReqAck.originAddr !== this.addr) {
            // forward text req ack
            if (this.routingTable.has(textReqAck.originAddr) && this.routingTable.get(textReqAck.originAddr)!.isValid()) {
                this.client.beginSend(new AtCmdSend(this.routingTable.get(textReqAck.originAddr)!.nextHop, textReqAck.str()));
                this.log(textReqAck, CaodvMsgLogType.Forwarded, this.routingTable.get(textReqAck.originAddr)!.nextHop);
                this.validateActiveRoute(addr);
            }

            return;
        }

        var textreq: PendingPacket<CaodvSendTextReq> | undefined = this.pendingOriginatedTextReqs.find(e => e.msg.msgSeqNumber === textReqAck!.msgSeqNumber);

        if (textreq == null)
            return;

        this.pendingOriginatedTextReqs = this.pendingOriginatedTextReqs.filter(e => e.msg.msgSeqNumber !== textReqAck!.msgSeqNumber);

        if (!this.messages.has(textreq.msg.destAddr))
            this.messages.set(textreq.msg.destAddr, []);
            
        this.messages.get(textreq.msg.destAddr)!.push({ msg: textreq.msg.payload, sent: true });
    }

    //////////////////////////////////////// Helper functions ////////////////////////////////////////
    incrementedSeqNumber(): number {
        return ByteUtils.signed((ByteUtils.unsigned(this.seqNumber) + 1) & 0xff);
    }

    incrementSeqNumber(): void {
        this.seqNumber = this.incrementedSeqNumber();
    }

    blacklistClient(addr: number): void {
        this.blacklist.set(addr, Date.now() + CaodvParams.BLACKLIST_ENTRY_LIFETIME);
    }

    clientIsBlacklisted(addr: number): boolean {
        return this.blacklist.has(addr) && this.blacklist.get(addr)! >= Date.now();
    }

    sendRERR(keysToInvalidate: number[]): void {
        keysToInvalidate.forEach(key => {
            var entry: RoutingTableEntry = this.routingTable.get(key)!;

            if (entry.precursors.size === 0)
                return;

            var rerr: CaodvRERR = new CaodvRERR([{ addr: key, seq: entry.sequenceNumber }]);
            entry.valid = false;
            var addr: number = entry.precursors.size > 1 ? 0 : entry.precursors.values().next().value;
            this.client.beginSend(new AtCmdSend(addr, rerr.str()));
            this.log(rerr, CaodvMsgLogType.Originated, addr);
        });
    }

    validateActiveRoute(dest: number) {
        if (this.routingTable.has(dest))
            this.routingTable.get(dest)!.expiringTime = Date.now() + CaodvParams.ROUTE_LIFETIME;
    }

    log(msg: CaodvRREQ | CaodvRREP | CaodvRERR | RREPACK | CaodvSendTextReq | CaodvSendTextReqAck | CaodvSendHopAck, type: CaodvMsgLogType, addr: number) {
        var str: string = `[${new Date().toLocaleTimeString()}] ${msg.constructor.name} ${type !== CaodvMsgLogType.Received ? "to  " : "from"} ${addr <= 0 ? "FFFF" : String(addr).padStart(4, '0')} (${[].concat.apply([], Object.values(msg)).join(", ")})`;
        console.log(str);
        this.msgLog.push({msg: str, type: type});
    }
}