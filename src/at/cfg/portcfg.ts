
export class PortConfig {
    device: string = '/dev/ttyS0';
    baudRate: number = 115200;
    parity: "none" | "even" | "mark" | "odd" | "space" | undefined = 'none';
    flowControl: number = 0;
    stopBits: 1 | 2 | undefined = 1;
    dataBits: 8 | 7 | 6 | 5 | undefined = 8;
}