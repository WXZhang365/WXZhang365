import * as fs from 'fs';
import { join } from "path";
import * as zlib from "node:zlib";

interface IZlib {
    ctx: Buffer,
    data: any[],
    getCentralDirectoryRecord: () => Promise<{
        fileName: string,
        data: string
    }[]>
}

export default class Zip implements IZlib {
    ctx: Buffer
    data: any[];
    constructor(base64data: string) {
        this.ctx = Buffer.from(base64data, "base64")
        console.log(this.ctx.byteLength)
        // this.ctx = fs.readFileSync(join(__dirname, fileName))
    }
    async getCentralDirectoryRecord(): Promise<{
        fileName: string;
        data: string;
    }[]> {
        return new Promise(async (res, rej) => {
            let index = 22
            let centralDirectoryRecord = this.ctx.slice(this.ctx.byteLength - index, this.ctx.byteLength)
            if (centralDirectoryRecord.slice(0, 2).toString() != "PK") {
                centralDirectoryRecord = this.ctx.slice(this.ctx.byteLength - ++index, this.ctx.byteLength - 1)
                if (centralDirectoryRecord.slice(0, 2).toString() != "PK") {
                    centralDirectoryRecord = this.ctx.slice(this.ctx.byteLength - ++index, this.ctx.byteLength - 2)
                    if (centralDirectoryRecord.slice(0, 2).toString() != "PK") {
                        throw new Error("文件损坏")
                    }
                }
            }
            const centralDirectoryHeaderRecordOffset = centralDirectoryRecord.slice(16, 17).readUint8() + centralDirectoryRecord.slice(17, 18).readUint8() * 256

            const centralDirectoryHeaderRecordSize = centralDirectoryRecord.slice(12, 15).readUint8()
            const centralDirectoryHeaderRecord = this.ctx.slice(centralDirectoryHeaderRecordOffset, centralDirectoryHeaderRecordOffset + centralDirectoryHeaderRecordSize)
            this.checks(centralDirectoryHeaderRecord)
            const numOfCentralDirectoryHeaderRecord = centralDirectoryRecord.slice(10, 12).readUint8()
            const fileName = []
            let LocalFileHeaderRecordOffset = []
            let indexOfCentralDirectoryHeaderRecords = 0
            const centralDirectoryHeaderRecords = []
            for (let index = 0; index < numOfCentralDirectoryHeaderRecord; index++) {
                let i = indexOfCentralDirectoryHeaderRecords
                const fileNameOffset = centralDirectoryHeaderRecord.slice(28 + i, 30 + i).readUint8()
                console.log(centralDirectoryHeaderRecord.slice(46 + i, 46 + fileNameOffset + i).toString())
                fileName.push(centralDirectoryHeaderRecord.slice(46 + i, 46 + fileNameOffset + i).toString())
                // LocalFileHeaderRecordOffset.push(centralDirectoryHeaderRecord.slice(42 + i, 44 + i).readUint8() + centralDirectoryHeaderRecord.slice(44 + i, 46 + i).readUint8() * 256)
                LocalFileHeaderRecordOffset.push(centralDirectoryHeaderRecord.slice(42 + i, 46 + i).readInt16LE())
                const extentLength = centralDirectoryHeaderRecord.slice(30 + i, 32 + i).readUint8()
                // const extent = centralDirectoryHeaderRecord.slice(46 + fileNameOffset + i, 46 + fileNameOffset + extentLength + i).toString()
                const commentLength = centralDirectoryHeaderRecord.slice(32 + i, 34 + i).readUint8()
                // const comment = centralDirectoryHeaderRecord.slice(46 + fileNameOffset + extentLength + i, 46 + fileNameOffset + extentLength + commentLength + i).toString()
                centralDirectoryHeaderRecords.push(centralDirectoryHeaderRecord.slice(i, 46 + fileNameOffset + extentLength + commentLength + i))
                console.log(indexOfCentralDirectoryHeaderRecords)
                indexOfCentralDirectoryHeaderRecords = 46 + fileNameOffset + extentLength + commentLength + indexOfCentralDirectoryHeaderRecords
            }
            console.log(LocalFileHeaderRecordOffset)
            const filesData = []
            const fn = []
            for (let index = 0; index < LocalFileHeaderRecordOffset.length; index++) {
                const i = LocalFileHeaderRecordOffset[index]
                const fileNameLength = this.ctx.slice(i + 26, i + 28).readUint8()
                const extentLength = this.ctx.slice(i + 28, i + 30).readUint8()
                fn.push(this.ctx.slice(i + 30, i + 30 + fileNameLength).toString())
                if (index == LocalFileHeaderRecordOffset.length - 1) {
                    filesData.push(this.ctx.slice(i + 30 + fileNameLength + extentLength, centralDirectoryHeaderRecordOffset))
                } else {
                    filesData.push(this.ctx.slice(i + 30 + fileNameLength + extentLength, LocalFileHeaderRecordOffset[index + 1]))
                }
            }
            console.log(fn)
            // return
            const result: { fileName, data }[] = []
            for (let index = 0; index < filesData.length; index++) {
                let data = filesData[index].toString()
                try {
                    data = await this.unzip(filesData[index])
                } catch (error) {
                    if (error.message == "unexpected end of file") {
                        data = filesData[index].toString()
                    }
                }
                result.push({
                    fileName: fileName[index],
                    data
                })
            }
            while (1) {
                if (result.length == numOfCentralDirectoryHeaderRecord) {
                    res(result)
                    break
                }
            }
        })
    }
    private unzip(data: Buffer) {
        return new Promise((res, rej) => {
            zlib.inflateRaw(data, function (err, result) {
                if (err) {
                    rej(err)
                } else
                    res(result.toString())
            })
        })

    }
    public saveByFile({
        path,
        fileArray
    }: {
        path?, fileArray: { fileName, data }[]
    }) {
        fs.mkdirSync(path, { recursive: true })
        for (let index = 0; index < fileArray.length; index++) {
            const element = fileArray[index];
            fs.mkdirSync(join(path, element.fileName.split("/")[0]), { recursive: true })
            fs.writeFileSync(join(__dirname, path, element.fileName), element.data)
        }
    }
    private checks(centralDirectoryHeaderRecord: Buffer) {
        //check version
        if (centralDirectoryHeaderRecord.slice(4, 6).readUint8() != 1 && centralDirectoryHeaderRecord.slice(6, 8).readUint8() != 20) {
            throw new Error("不支持的版本")
        }
        if (centralDirectoryHeaderRecord.slice(8, 10).readUint8() != 0) {
            throw new Error("压缩包带有密码")
        }
    }
}
const buf = fs.readFileSync(join(__dirname, "./test.zip"));

const zip = new Zip(buf.toString('base64'))
zip.getCentralDirectoryRecord().then(res => {
    zip.saveByFile({
        fileArray: res,
        path: "./testdir"
    })
    console.log(res)
})