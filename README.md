## 这是一个对于node核心库zlib的拓展
通过传入buffer或者base64等任意形式的zip数据，实现对多文件（文件夹）的解压
```

type results = {fileName:string,data:string}[]

const buf = new Zip(buffer|base64)
const result:results = await buf.getCentralDirectoryRecord()
```