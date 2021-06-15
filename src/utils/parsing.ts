
export class Parsing {
    static strToBytes(str: string, offset: number, count: number): number[] {
        var bytes = [];
    
        for (var i = offset; i < count; i++)
            bytes.push((str.charCodeAt(i) >>> 0) & 0xff);
    
        return bytes;
    }
    
    static bytesToStr(bytes: number[]) {
        var str = "";
    
        for (var i = 0; i < bytes.length; i++)
            str += String.fromCharCode(bytes[i]);
    
        return str;
    }
}