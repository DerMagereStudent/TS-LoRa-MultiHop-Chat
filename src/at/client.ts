import SerialPort from "serialport";
import { FlagUtils } from "../utils/flagutils";
import { ATConfig } from "./cfg/atcfg";
import { PortConfig } from "./cfg/portcfg";
import { AtCmd, AtCmdState } from "./cmd/atcmd";
import { AtCmdAddr } from "./cmd/atcmdaddr";
import { AtCmdCfg } from "./cmd/atcmdcfg";
import { AtCmdRst } from "./cmd/atcmdrst";

export interface MsgCallback {
    (addr: number, msg: string): void;
}

export interface LogCallback {
    (msg: string, type: AtLogType): void;
}

export enum AtLogType {
    Valid,
    Invalid,
    Send,
    Receive
}

export class AtClient {
    port!: SerialPort;
    running: boolean = false;

    pendingCmds: AtCmd[] = [];
    buffer: string[] = [];

    callbacks: MsgCallback[] = [];
    logCallbacks: LogCallback[] = [];

    parser: SerialPort.parsers.Readline;

    constructor() {        
        this.parser = new SerialPort.parsers.Readline({
            "delimiter": "\r\n",
            "encoding": "ascii"
        });

        this.parser.on('data', (data) => {
            this.buffer.push(data);
        });

        this.parser.on('error', (data) => {
            console.log(`Error: ${data}`);
        });
    }

    start(pcfg: PortConfig, acfg: ATConfig) {
        this.port = new SerialPort(
            pcfg.device,
            {
                autoOpen: true,
                baudRate: pcfg.baudRate,
                parity: pcfg.parity,
                stopBits: pcfg.stopBits,
                dataBits: pcfg.dataBits
            }
        );

        this.port.pipe(this.parser);

        this.beginSend(new AtCmdRst());
        this.beginSend(new AtCmdCfg(acfg));
        this.beginSend(new AtCmdAddr(18));

        this.running = true;
        this.run();
    }

    stop() { }
    beginSend(cmd: AtCmd) { this.pendingCmds.push(cmd); }

    beginReceiveMsg(callback: MsgCallback) {
        if (!this.callbacks.includes(callback))
            this.callbacks.push(callback);
    }

    beginReceiveLog(callback: LogCallback) {
        if (!this.logCallbacks.includes(callback))
            this.logCallbacks.push(callback);
    }

    run() {
        while (this.pendingCmds && this.pendingCmds.length > 0 && FlagUtils.hasFlag(this.pendingCmds[0].state(), AtCmdState.Finished))
            this.pendingCmds.shift();

        if (!this.pendingCmds || this.pendingCmds.length == 0 || FlagUtils.hasFlag(this.pendingCmds[0].state(), AtCmdState.Send)) {
            if (!this.buffer || this.buffer.length == 0) {
                setTimeout(this.run.bind(this), 20);
                return;
            }

            var msg: string = this.buffer.shift()!;

            if (msg.startsWith("LR")) {
                var parts: string[] = msg.split(',');
                var addr: number = parts.length < 4 ? 0 : parseInt(parts[1], 10);
                var content: string = parts.length < 4 ? msg : parts.slice(3).join(',');
                
                this.callbacks.forEach((val, i, c) => { val(addr, content) });
                this.logCallbacks.forEach((val, i, c) => { val(msg, AtLogType.Receive); });
            } else {
                if (this.pendingCmds.length == 0) {
                    setTimeout(this.run.bind(this), 20);
                    return;
                }

                var valid: boolean = this.pendingCmds[0].processResponse(msg);
                this.logCallbacks.forEach((val, i, c) => { val(msg, valid ? AtLogType.Valid : AtLogType.Invalid); });
            }
        } else {
            var msg: string = this.pendingCmds[0].nextString();
            this.port.write(msg);
            this.pendingCmds[0].confirmSend();
            this.logCallbacks.forEach((val, i, c) => { val(msg, AtLogType.Send); });
        }
        
        setTimeout(this.run.bind(this), 20);
    }
}