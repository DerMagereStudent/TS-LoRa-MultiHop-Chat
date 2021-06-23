
export class ATConfig {
    rfFrequency: number = 433000000;
    power: number = 20;
    bandwidth: number = 9;
    spreadingFactor: number = 10;
    errorCoding: number = 4;
    crc: number = 1;
    implicitHeader: number = 0;
    rxSingleOn: number = 0;
    frequencyHopOn: number = 0;
    hopPeriod: number = 0;
    rxPacketTimeout: number = 3000;
    payloadLength: number = 8;
    preambleLength: number = 10;
}