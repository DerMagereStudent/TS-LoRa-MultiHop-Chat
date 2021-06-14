import { ATConfig } from "../cfg/atcfg";
import { AtCmdOneLiner } from "./atcmdonel";

export class AtCmdCfg extends AtCmdOneLiner {
    constructor(cfg: ATConfig) {
        super(`AT+CFG=${cfg.rfFrequency},${cfg.power},${cfg.bandwidth},${cfg.spreadingFactor},${cfg.errorCoding},${cfg.crc},${cfg.implicitHeader},${cfg.rxSingleOn},${cfg.frequencyHopOn},${cfg.hopPeriod},${cfg.rxPacketTimeout},${cfg.payloadLength},${cfg.preambleLength}\r\n`);
    }
}