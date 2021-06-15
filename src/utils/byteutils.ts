
export class ByteUtils {
    static unsigned(byte: number): number {
        return (byte >>> 0) & 0xff
    }

    static signed(byte: number): number {
        var b = byte & 0xff;

        if (b < 0)
            return b;
        
        if (b < 128)
            return b;

        return -128 + (b - 128);
    }

    /**
     * Subtracts b from a, dropping the overflow
     * @returns Signed byte between 127 and -128
     */
    static subtract(a: number, b: number): number {
        return (a - b) & 0xff;
    }
}