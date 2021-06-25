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

    constructor(rreq: T, tries: number, expiringTime: number) {
        this.msg = rreq;
        this.tries = tries;
        this.expiringTime = expiringTime;
    }
}

export interface RouteCallback {
    (dest: number): void;
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
    pendingRequests: Map<number, PendingPacket<CaodvRREQ>>;
    pendingReplies: Map<number, PendingPacket<CaodvRREP>[]>;
    blacklist: Map<number, number> // Map dest to entry expiring datetime in ms

    msgHandlers: Map<number, MsgHandler> // Map msg type to corresponding handler function pointer.
    routeCallbacks: RouteCallback[];

    atLog: { msg: string, type: AtLogType }[];
    msgLog: { msg: string, type: CaodvMsgLogType }[];

    addr: number;
    broadcastID: number;
    seqNumber: number;

    constructor() {
        this.client = new AtClient();
        
        this.routingTable = new Map<number, RoutingTableEntry>();
        this.clientInfo = new Map<number, ClientInformation>();
        this.pendingRequests = new Map<number, PendingPacket<CaodvRREQ>>();
        this.pendingReplies = new Map<number, PendingPacket<CaodvRREP>[]>();
        this.blacklist = new Map<number, number>();

        this.routeCallbacks = [];

        this.atLog = [];
        this.msgLog = [];

        this.addr = 18;
        this.broadcastID = 0;
        this.seqNumber = 0;

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

    hasRoute = (dest: number): boolean => this.routingTable.get(dest)!.expiringTime > Date.now();

    registerRouteCallback(callback: RouteCallback): void {
        if (!this.routeCallbacks.includes(callback))
            this.routeCallbacks.push(callback);
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

            if (value.tries === CaodvParams.MAX_TRIES)
                this.pendingRequests.delete(key) // TODO: Route failure
            else {
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
        } else if (this.addr === rrep.originAddr && this.pendingRequests.has(rrep.destAddr)) {
            this.routeCallbacks.forEach((callback, index, array) => {
                callback(rrep!.destAddr);
            });
            
            this.pendingRequests.delete(rrep.destAddr);
        }

        // send reply ack to previous hop
        this.client.beginSend(new AtCmdSend(addr, new RREPACK().str()));
        this.log(new RREPACK(), CaodvMsgLogType.Originated, addr);
    }

    handleRREPACK(addr: number, msg: string): void {
        this.log(new RREPACK(), CaodvMsgLogType.Received, addr);

        if (this.pendingReplies.has(addr))
            this.pendingReplies.get(addr)!.shift(); // 
    }

    handleRERR(addr: number, msg: string): void {
        
    }

    handleSENDTEXTREQ(addr: number, msg: string): void {
        var textreq: CaodvSendTextReq | undefined = CaodvSendTextReq.parse(msg);

        if (textreq == null)
            return;

        this.log(textreq, CaodvMsgLogType.Received, addr);

        
    }

    handleSENDHOPACK(addr: number, msg: string): void {
        
    }

    handleSENDTEXTREQACK(addr: number, msg: string): void {
        
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

    sendRERR(addr: number): void {

    }

    log(msg: CaodvRREQ | CaodvRREP | CaodvRERR | RREPACK | CaodvSendTextReq | CaodvSendTextReqAck | CaodvSendHopAck, type: CaodvMsgLogType, addr: number) {
        var str: string = `[${new Date().toLocaleTimeString()}] ${msg.constructor.name} ${type !== CaodvMsgLogType.Received ? "to     " : "from"} ${addr <= 0 ? "FFFF" : String(addr).padStart(4, '0')} (${[].concat.apply([], Object.values(msg)).join(", ")})`;
        console.log(str);
        this.msgLog.push({msg: str, type: type});
    }
}