
export class PortConfig {
    device: string = '/dev/ttyS0';
    baudRate: number = 115200;
    parity: string = 'none';
    flowControl: number = 0;
    stopBits: number = 1;
    dataBits: number = 8;
}