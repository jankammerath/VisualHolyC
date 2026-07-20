var Module = typeof Module != "undefined" ? Module : {};
var ENVIRONMENT_IS_WEB = !!globalThis.window;
var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != "renderer";
var arguments_ = [];
var thisProgram = "./this.program";
var quit_ = (status, toThrow) => {
    throw toThrow
};
var _scriptName = globalThis.document?.currentScript?.src;
if (typeof __filename != "undefined") {
    _scriptName = __filename
} else if (ENVIRONMENT_IS_WORKER) {
    _scriptName = self.location.href
}
var scriptDirectory = "";

function locateFile(path) {
    if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory)
    }
    return scriptDirectory + path
}
var readAsync, readBinary;
if (ENVIRONMENT_IS_NODE) {
    var fs = require("fs");
    scriptDirectory = __dirname + "/";
    readBinary = filename => {
        filename = isFileURI(filename) ? new URL(filename) : filename;
        var ret = fs.readFileSync(filename);
        return ret
    };
    readAsync = async (filename, binary = true) => {
        filename = isFileURI(filename) ? new URL(filename) : filename;
        var ret = fs.readFileSync(filename, binary ? undefined : "utf8");
        return ret
    };
    if (process.argv.length > 1) {
        thisProgram = process.argv[1].replace(/\\/g, "/")
    }
    arguments_ = process.argv.slice(2);
    if (typeof module != "undefined") {
        module["exports"] = Module
    }
    quit_ = (status, toThrow) => {
        process.exitCode = status;
        throw toThrow
    }
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
        scriptDirectory = new URL(".", _scriptName).href
    } catch {} {
        if (ENVIRONMENT_IS_WORKER) {
            readBinary = url => {
                var xhr = new XMLHttpRequest;
                xhr.open("GET", url, false);
                xhr.responseType = "arraybuffer";
                xhr.send(null);
                return new Uint8Array(xhr.response)
            }
        }
        readAsync = async url => {
            if (isFileURI(url)) {
                return new Promise((resolve, reject) => {
                    var xhr = new XMLHttpRequest;
                    xhr.open("GET", url, true);
                    xhr.responseType = "arraybuffer";
                    xhr.onload = () => {
                        if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                            resolve(xhr.response);
                            return
                        }
                        reject(xhr.status)
                    };
                    xhr.onerror = reject;
                    xhr.send(null)
                })
            }
            var response = await fetch(url, {
                credentials: "same-origin"
            });
            if (response.ok) {
                return response.arrayBuffer()
            }
            throw new Error(response.status + " : " + response.url)
        }
    }
} else {}
var out = console.log.bind(console);
var err = console.error.bind(console);
var wasmBinary;
var ABORT = false;
var EXITSTATUS;
var isFileURI = filename => filename.startsWith("file://");
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
var HEAP64, HEAPU64;
var runtimeInitialized = false;

function updateMemoryViews() {
    var b = wasmMemory.buffer;
    HEAP8 = new Int8Array(b);
    HEAP16 = new Int16Array(b);
    HEAPU8 = new Uint8Array(b);
    HEAPU16 = new Uint16Array(b);
    HEAP32 = new Int32Array(b);
    HEAPU32 = new Uint32Array(b);
    HEAPF32 = new Float32Array(b);
    HEAPF64 = new Float64Array(b);
    HEAP64 = new BigInt64Array(b);
    HEAPU64 = new BigUint64Array(b)
}

function preRun() {
    if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
            addOnPreRun(Module["preRun"].shift())
        }
    }
    callRuntimeCallbacks(onPreRuns)
}

function initRuntime() {
    runtimeInitialized = true;
    if (!Module["noFSInit"] && !FS.initialized) FS.init();
    TTY.init();
    SOCKFS.root = FS.mount(SOCKFS, {}, null);
    wasmExports["oe"]();
    FS.ignorePermissions = false
}

function preMain() {}

function postRun() {
    if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
            addOnPostRun(Module["postRun"].shift())
        }
    }
    callRuntimeCallbacks(onPostRuns)
}

function abort(what) {
    Module["onAbort"]?.(what);
    what = "Aborted(" + what + ")";
    err(what);
    ABORT = true;
    what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    throw e
}
var wasmBinaryFile;

function findWasmBinary() {
    return locateFile("aiwnios.wasm")
}

function getBinarySync(file) {
    if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary)
    }
    if (readBinary) {
        return readBinary(file)
    }
    throw "both async and sync fetching of the wasm failed"
}
async function getWasmBinary(binaryFile) {
    if (!wasmBinary) {
        try {
            var response = await readAsync(binaryFile);
            return new Uint8Array(response)
        } catch {}
    }
    return getBinarySync(binaryFile)
}
async function instantiateArrayBuffer(binaryFile, imports) {
    try {
        var binary = await getWasmBinary(binaryFile);
        var instance = await WebAssembly.instantiate(binary, imports);
        return instance
    } catch (reason) {
        err(`failed to asynchronously prepare wasm: ${reason}`);
        abort(reason)
    }
}
async function instantiateAsync(binary, binaryFile, imports) {
    if (!binary && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {
        try {
            var response = fetch(binaryFile, {
                credentials: "same-origin"
            });
            var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
            return instantiationResult
        } catch (reason) {
            err(`wasm streaming compile failed: ${reason}`);
            err("falling back to ArrayBuffer instantiation")
        }
    }
    return instantiateArrayBuffer(binaryFile, imports)
}

function getWasmImports() {
    var imports = {
        a: wasmImports
    };
    return imports
}
async function createWasm() {
    function receiveInstance(instance, module) {
        wasmExports = instance.exports;
        assignWasmExports(wasmExports);
        updateMemoryViews();
        removeRunDependency("wasm-instantiate");
        return wasmExports
    }
    addRunDependency("wasm-instantiate");

    function receiveInstantiationResult(result) {
        return receiveInstance(result["instance"])
    }
    var info = getWasmImports();
    if (Module["instantiateWasm"]) {
        return new Promise((resolve, reject) => {
            Module["instantiateWasm"](info, (inst, mod) => {
                resolve(receiveInstance(inst, mod))
            })
        })
    }
    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
    var exports = receiveInstantiationResult(result);
    return exports
}
class ExitStatus {
    name = "ExitStatus";
    constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status
    }
}
var callRuntimeCallbacks = callbacks => {
    while (callbacks.length > 0) {
        callbacks.shift()(Module)
    }
};
var onPostRuns = [];
var addOnPostRun = cb => onPostRuns.push(cb);
var onPreRuns = [];
var addOnPreRun = cb => onPreRuns.push(cb);
var runDependencies = 0;
var dependenciesFulfilled = null;
var removeRunDependency = id => {
    runDependencies--;
    Module["monitorRunDependencies"]?.(runDependencies);
    if (runDependencies == 0) {
        if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback()
        }
    }
};
var addRunDependency = id => {
    runDependencies++;
    Module["monitorRunDependencies"]?.(runDependencies)
};
var noExitRuntime = true;

function setValue(ptr, value, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
        case "i1":
            HEAP8[ptr] = value;
            break;
        case "i8":
            HEAP8[ptr] = value;
            break;
        case "i16":
            HEAP16[ptr >> 1] = value;
            break;
        case "i32":
            HEAP32[ptr >> 2] = value;
            break;
        case "i64":
            HEAP64[ptr >> 3] = BigInt(value);
            break;
        case "float":
            HEAPF32[ptr >> 2] = value;
            break;
        case "double":
            HEAPF64[ptr >> 3] = value;
            break;
        case "*":
            HEAPU32[ptr >> 2] = value;
            break;
        default:
            abort(`invalid type for setValue: ${type}`)
    }
}
var stackRestore = val => __emscripten_stack_restore(val);
var stackSave = () => _emscripten_stack_get_current();
var UTF8Decoder = new TextDecoder;
var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx
};
var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
    if (!ptr) return "";
    var end = findStringEnd(HEAPU8, ptr, maxBytesToRead, ignoreNul);
    return UTF8Decoder.decode(HEAPU8.subarray(ptr, end))
};
var ___assert_fail = (condition, filename, line, func) => abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function"]);
var PATH = {
    isAbs: path => path.charAt(0) === "/",
    splitPath: filename => {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1)
    },
    normalizeArray: (parts, allowAboveRoot) => {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
            var last = parts[i];
            if (last === ".") {
                parts.splice(i, 1)
            } else if (last === "..") {
                parts.splice(i, 1);
                up++
            } else if (up) {
                parts.splice(i, 1);
                up--
            }
        }
        if (allowAboveRoot) {
            for (; up; up--) {
                parts.unshift("..")
            }
        }
        return parts
    },
    normalize: path => {
        var isAbsolute = PATH.isAbs(path),
            trailingSlash = path.slice(-1) === "/";
        path = PATH.normalizeArray(path.split("/").filter(p => !!p), !isAbsolute).join("/");
        if (!path && !isAbsolute) {
            path = "."
        }
        if (path && trailingSlash) {
            path += "/"
        }
        return (isAbsolute ? "/" : "") + path
    },
    dirname: path => {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
            return "."
        }
        if (dir) {
            dir = dir.slice(0, -1)
        }
        return root + dir
    },
    basename: path => path && path.match(/([^\/]+|\/)\/*$/)[1],
    join: (...paths) => PATH.normalize(paths.join("/")),
    join2: (l, r) => PATH.normalize(l + "/" + r)
};
var initRandomFill = () => {
    if (ENVIRONMENT_IS_NODE) {
        var nodeCrypto = require("crypto");
        return view => nodeCrypto.randomFillSync(view)
    }
    return view => crypto.getRandomValues(view)
};
var randomFill = view => {
    (randomFill = initRandomFill())(view)
};
var PATH_FS = {
    resolve: (...args) => {
        var resolvedPath = "",
            resolvedAbsolute = false;
        for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
            var path = i >= 0 ? args[i] : FS.cwd();
            if (typeof path != "string") {
                throw new TypeError("Arguments to path.resolve must be strings")
            } else if (!path) {
                return ""
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = PATH.isAbs(path)
        }
        resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter(p => !!p), !resolvedAbsolute).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || "."
    },
    relative: (from, to) => {
        from = PATH_FS.resolve(from).slice(1);
        to = PATH_FS.resolve(to).slice(1);

        function trim(arr) {
            var start = 0;
            for (; start < arr.length; start++) {
                if (arr[start] !== "") break
            }
            var end = arr.length - 1;
            for (; end >= 0; end--) {
                if (arr[end] !== "") break
            }
            if (start > end) return [];
            return arr.slice(start, end - start + 1)
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break
            }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push("..")
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/")
    }
};
var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
    return UTF8Decoder.decode(heapOrArray.buffer ? heapOrArray.subarray(idx, endPtr) : new Uint8Array(heapOrArray.slice(idx, endPtr)))
};
var FS_stdin_getChar_buffer = [];
var lengthBytesUTF8 = str => {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
        var c = str.charCodeAt(i);
        if (c <= 127) {
            len++
        } else if (c <= 2047) {
            len += 2
        } else if (c >= 55296 && c <= 57343) {
            len += 4;
            ++i
        } else {
            len += 3
        }
    }
    return len
};
var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
        var u = str.codePointAt(i);
        if (u <= 127) {
            if (outIdx >= endIdx) break;
            heap[outIdx++] = u
        } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx) break;
            heap[outIdx++] = 192 | u >> 6;
            heap[outIdx++] = 128 | u & 63
        } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx) break;
            heap[outIdx++] = 224 | u >> 12;
            heap[outIdx++] = 128 | u >> 6 & 63;
            heap[outIdx++] = 128 | u & 63
        } else {
            if (outIdx + 3 >= endIdx) break;
            heap[outIdx++] = 240 | u >> 18;
            heap[outIdx++] = 128 | u >> 12 & 63;
            heap[outIdx++] = 128 | u >> 6 & 63;
            heap[outIdx++] = 128 | u & 63;
            i++
        }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx
};
var intArrayFromString = (stringy, dontAddNull, length) => {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array
};
var FS_stdin_getChar = () => {
    if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
            var BUFSIZE = 256;
            var buf = Buffer.alloc(BUFSIZE);
            var bytesRead = 0;
            var fd = process.stdin.fd;
            try {
                bytesRead = fs.readSync(fd, buf, 0, BUFSIZE)
            } catch (e) {
                if (e.toString().includes("EOF")) bytesRead = 0;
                else throw e
            }
            if (bytesRead > 0) {
                result = buf.slice(0, bytesRead).toString("utf-8")
            }
        } else if (globalThis.window?.prompt) {
            result = window.prompt("Input: ");
            if (result !== null) {
                result += "\n"
            }
        } else {}
        if (!result) {
            return null
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true)
    }
    return FS_stdin_getChar_buffer.shift()
};
var TTY = {
    ttys: [],
    init() {},
    shutdown() {},
    register(dev, ops) {
        TTY.ttys[dev] = {
            input: [],
            output: [],
            ops
        };
        FS.registerDevice(dev, TTY.stream_ops)
    },
    stream_ops: {
        open(stream) {
            var tty = TTY.ttys[stream.node.rdev];
            if (!tty) {
                throw new FS.ErrnoError(43)
            }
            stream.tty = tty;
            stream.seekable = false
        },
        close(stream) {
            stream.tty.ops.fsync(stream.tty)
        },
        fsync(stream) {
            stream.tty.ops.fsync(stream.tty)
        },
        read(stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.get_char) {
                throw new FS.ErrnoError(60)
            }
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
                var result;
                try {
                    result = stream.tty.ops.get_char(stream.tty)
                } catch (e) {
                    throw new FS.ErrnoError(29)
                }
                if (result === undefined && bytesRead === 0) {
                    throw new FS.ErrnoError(6)
                }
                if (result === null || result === undefined) break;
                bytesRead++;
                buffer[offset + i] = result
            }
            if (bytesRead) {
                stream.node.atime = Date.now()
            }
            return bytesRead
        },
        write(stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.put_char) {
                throw new FS.ErrnoError(60)
            }
            try {
                for (var i = 0; i < length; i++) {
                    stream.tty.ops.put_char(stream.tty, buffer[offset + i])
                }
            } catch (e) {
                throw new FS.ErrnoError(29)
            }
            if (length) {
                stream.node.mtime = stream.node.ctime = Date.now()
            }
            return i
        }
    },
    default_tty_ops: {
        get_char(tty) {
            return FS_stdin_getChar()
        },
        put_char(tty, val) {
            if (val === null || val === 10) {
                out(UTF8ArrayToString(tty.output));
                tty.output = []
            } else {
                if (val != 0) tty.output.push(val)
            }
        },
        fsync(tty) {
            if (tty.output?.length > 0) {
                out(UTF8ArrayToString(tty.output));
                tty.output = []
            }
        },
        ioctl_tcgets(tty) {
            return {
                c_iflag: 25856,
                c_oflag: 5,
                c_cflag: 191,
                c_lflag: 35387,
                c_cc: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
            }
        },
        ioctl_tcsets(tty, optional_actions, data) {
            return 0
        },
        ioctl_tiocgwinsz(tty) {
            return [24, 80]
        }
    },
    default_tty1_ops: {
        put_char(tty, val) {
            if (val === null || val === 10) {
                err(UTF8ArrayToString(tty.output));
                tty.output = []
            } else {
                if (val != 0) tty.output.push(val)
            }
        },
        fsync(tty) {
            if (tty.output?.length > 0) {
                err(UTF8ArrayToString(tty.output));
                tty.output = []
            }
        }
    }
};
var zeroMemory = (ptr, size) => HEAPU8.fill(0, ptr, ptr + size);
var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
var mmapAlloc = size => {
    size = alignMemory(size, 65536);
    var ptr = _emscripten_builtin_memalign(65536, size);
    if (ptr) zeroMemory(ptr, size);
    return ptr
};
var MEMFS = {
    ops_table: null,
    mount(mount) {
        return MEMFS.createNode(null, "/", 16895, 0)
    },
    createNode(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
            throw new FS.ErrnoError(63)
        }
        MEMFS.ops_table ||= {
            dir: {
                node: {
                    getattr: MEMFS.node_ops.getattr,
                    setattr: MEMFS.node_ops.setattr,
                    lookup: MEMFS.node_ops.lookup,
                    mknod: MEMFS.node_ops.mknod,
                    rename: MEMFS.node_ops.rename,
                    unlink: MEMFS.node_ops.unlink,
                    rmdir: MEMFS.node_ops.rmdir,
                    readdir: MEMFS.node_ops.readdir,
                    symlink: MEMFS.node_ops.symlink
                },
                stream: {
                    llseek: MEMFS.stream_ops.llseek
                }
            },
            file: {
                node: {
                    getattr: MEMFS.node_ops.getattr,
                    setattr: MEMFS.node_ops.setattr
                },
                stream: {
                    llseek: MEMFS.stream_ops.llseek,
                    read: MEMFS.stream_ops.read,
                    write: MEMFS.stream_ops.write,
                    mmap: MEMFS.stream_ops.mmap,
                    msync: MEMFS.stream_ops.msync
                }
            },
            link: {
                node: {
                    getattr: MEMFS.node_ops.getattr,
                    setattr: MEMFS.node_ops.setattr,
                    readlink: MEMFS.node_ops.readlink
                },
                stream: {}
            },
            chrdev: {
                node: {
                    getattr: MEMFS.node_ops.getattr,
                    setattr: MEMFS.node_ops.setattr
                },
                stream: FS.chrdev_stream_ops
            }
        };
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
            node.node_ops = MEMFS.ops_table.dir.node;
            node.stream_ops = MEMFS.ops_table.dir.stream;
            node.contents = {}
        } else if (FS.isFile(node.mode)) {
            node.node_ops = MEMFS.ops_table.file.node;
            node.stream_ops = MEMFS.ops_table.file.stream;
            node.usedBytes = 0;
            node.contents = null
        } else if (FS.isLink(node.mode)) {
            node.node_ops = MEMFS.ops_table.link.node;
            node.stream_ops = MEMFS.ops_table.link.stream
        } else if (FS.isChrdev(node.mode)) {
            node.node_ops = MEMFS.ops_table.chrdev.node;
            node.stream_ops = MEMFS.ops_table.chrdev.stream
        }
        node.atime = node.mtime = node.ctime = Date.now();
        if (parent) {
            parent.contents[name] = node;
            parent.atime = parent.mtime = parent.ctime = node.atime
        }
        return node
    },
    getFileDataAsTypedArray(node) {
        if (!node.contents) return new Uint8Array(0);
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
        return new Uint8Array(node.contents)
    },
    expandFileStorage(node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity);
        if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0)
    },
    resizeFileStorage(node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
            node.contents = null;
            node.usedBytes = 0
        } else {
            var oldContents = node.contents;
            node.contents = new Uint8Array(newSize);
            if (oldContents) {
                node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)))
            }
            node.usedBytes = newSize
        }
    },
    node_ops: {
        getattr(node) {
            var attr = {};
            attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
            attr.ino = node.id;
            attr.mode = node.mode;
            attr.nlink = 1;
            attr.uid = 0;
            attr.gid = 0;
            attr.rdev = node.rdev;
            if (FS.isDir(node.mode)) {
                attr.size = 4096
            } else if (FS.isFile(node.mode)) {
                attr.size = node.usedBytes
            } else if (FS.isLink(node.mode)) {
                attr.size = node.link.length
            } else {
                attr.size = 0
            }
            attr.atime = new Date(node.atime);
            attr.mtime = new Date(node.mtime);
            attr.ctime = new Date(node.ctime);
            attr.blksize = 4096;
            attr.blocks = Math.ceil(attr.size / attr.blksize);
            return attr
        },
        setattr(node, attr) {
            for (const key of ["mode", "atime", "mtime", "ctime"]) {
                if (attr[key] != null) {
                    node[key] = attr[key]
                }
            }
            if (attr.size !== undefined) {
                MEMFS.resizeFileStorage(node, attr.size)
            }
        },
        lookup(parent, name) {
            if (!MEMFS.doesNotExistError) {
                MEMFS.doesNotExistError = new FS.ErrnoError(44);
                MEMFS.doesNotExistError.stack = "<generic error, no stack>"
            }
            throw MEMFS.doesNotExistError
        },
        mknod(parent, name, mode, dev) {
            return MEMFS.createNode(parent, name, mode, dev)
        },
        rename(old_node, new_dir, new_name) {
            var new_node;
            try {
                new_node = FS.lookupNode(new_dir, new_name)
            } catch (e) {}
            if (new_node) {
                if (FS.isDir(old_node.mode)) {
                    for (var i in new_node.contents) {
                        throw new FS.ErrnoError(55)
                    }
                }
                FS.hashRemoveNode(new_node)
            }
            delete old_node.parent.contents[old_node.name];
            new_dir.contents[new_name] = old_node;
            old_node.name = new_name;
            new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now()
        },
        unlink(parent, name) {
            delete parent.contents[name];
            parent.ctime = parent.mtime = Date.now()
        },
        rmdir(parent, name) {
            var node = FS.lookupNode(parent, name);
            for (var i in node.contents) {
                throw new FS.ErrnoError(55)
            }
            delete parent.contents[name];
            parent.ctime = parent.mtime = Date.now()
        },
        readdir(node) {
            return [".", "..", ...Object.keys(node.contents)]
        },
        symlink(parent, newname, oldpath) {
            var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
            node.link = oldpath;
            return node
        },
        readlink(node) {
            if (!FS.isLink(node.mode)) {
                throw new FS.ErrnoError(28)
            }
            return node.link
        }
    },
    stream_ops: {
        read(stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= stream.node.usedBytes) return 0;
            var size = Math.min(stream.node.usedBytes - position, length);
            if (size > 8 && contents.subarray) {
                buffer.set(contents.subarray(position, position + size), offset)
            } else {
                for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i]
            }
            return size
        },
        write(stream, buffer, offset, length, position, canOwn) {
            if (buffer.buffer === HEAP8.buffer) {
                canOwn = false
            }
            if (!length) return 0;
            var node = stream.node;
            node.mtime = node.ctime = Date.now();
            if (buffer.subarray && (!node.contents || node.contents.subarray)) {
                if (canOwn) {
                    node.contents = buffer.subarray(offset, offset + length);
                    node.usedBytes = length;
                    return length
                } else if (node.usedBytes === 0 && position === 0) {
                    node.contents = buffer.slice(offset, offset + length);
                    node.usedBytes = length;
                    return length
                } else if (position + length <= node.usedBytes) {
                    node.contents.set(buffer.subarray(offset, offset + length), position);
                    return length
                }
            }
            MEMFS.expandFileStorage(node, position + length);
            if (node.contents.subarray && buffer.subarray) {
                node.contents.set(buffer.subarray(offset, offset + length), position)
            } else {
                for (var i = 0; i < length; i++) {
                    node.contents[position + i] = buffer[offset + i]
                }
            }
            node.usedBytes = Math.max(node.usedBytes, position + length);
            return length
        },
        llseek(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.usedBytes
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(28)
            }
            return position
        },
        mmap(stream, length, position, prot, flags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(43)
            }
            var ptr;
            var allocated;
            var contents = stream.node.contents;
            if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {
                allocated = false;
                ptr = contents.byteOffset
            } else {
                allocated = true;
                ptr = mmapAlloc(length);
                if (!ptr) {
                    throw new FS.ErrnoError(48)
                }
                if (contents) {
                    if (position > 0 || position + length < contents.length) {
                        if (contents.subarray) {
                            contents = contents.subarray(position, position + length)
                        } else {
                            contents = Array.prototype.slice.call(contents, position, position + length)
                        }
                    }
                    HEAP8.set(contents, ptr)
                }
            }
            return {
                ptr,
                allocated
            }
        },
        msync(stream, buffer, offset, length, mmapFlags) {
            MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
            return 0
        }
    }
};
var FS_modeStringToFlags = str => {
    var flagModes = {
        r: 0,
        "r+": 2,
        w: 512 | 64 | 1,
        "w+": 512 | 64 | 2,
        a: 1024 | 64 | 1,
        "a+": 1024 | 64 | 2
    };
    var flags = flagModes[str];
    if (typeof flags == "undefined") {
        throw new Error(`Unknown file open mode: ${str}`)
    }
    return flags
};
var FS_getMode = (canRead, canWrite) => {
    var mode = 0;
    if (canRead) mode |= 292 | 73;
    if (canWrite) mode |= 146;
    return mode
};
var IDBFS = {
    dbs: {},
    indexedDB: () => indexedDB,
    DB_VERSION: 21,
    DB_STORE_NAME: "FILE_DATA",
    queuePersist: mount => {
        function onPersistComplete() {
            if (mount.idbPersistState === "again") startPersist();
            else mount.idbPersistState = 0
        }

        function startPersist() {
            mount.idbPersistState = "idb";
            IDBFS.syncfs(mount, false, onPersistComplete)
        }
        if (!mount.idbPersistState) {
            mount.idbPersistState = setTimeout(startPersist, 0)
        } else if (mount.idbPersistState === "idb") {
            mount.idbPersistState = "again"
        }
    },
    mount: mount => {
        var mnt = MEMFS.mount(mount);
        if (mount?.opts?.autoPersist) {
            mount.idbPersistState = 0;
            var memfs_node_ops = mnt.node_ops;
            mnt.node_ops = {
                ...mnt.node_ops
            };
            mnt.node_ops.mknod = (parent, name, mode, dev) => {
                var node = memfs_node_ops.mknod(parent, name, mode, dev);
                node.node_ops = mnt.node_ops;
                node.idbfs_mount = mnt.mount;
                node.memfs_stream_ops = node.stream_ops;
                node.stream_ops = {
                    ...node.stream_ops
                };
                node.stream_ops.write = (stream, buffer, offset, length, position, canOwn) => {
                    stream.node.isModified = true;
                    return node.memfs_stream_ops.write(stream, buffer, offset, length, position, canOwn)
                };
                node.stream_ops.close = stream => {
                    var n = stream.node;
                    if (n.isModified) {
                        IDBFS.queuePersist(n.idbfs_mount);
                        n.isModified = false
                    }
                    if (n.memfs_stream_ops.close) return n.memfs_stream_ops.close(stream)
                };
                IDBFS.queuePersist(mnt.mount);
                return node
            };
            mnt.node_ops.rmdir = (...args) => (IDBFS.queuePersist(mnt.mount), memfs_node_ops.rmdir(...args));
            mnt.node_ops.symlink = (...args) => (IDBFS.queuePersist(mnt.mount), memfs_node_ops.symlink(...args));
            mnt.node_ops.unlink = (...args) => (IDBFS.queuePersist(mnt.mount), memfs_node_ops.unlink(...args));
            mnt.node_ops.rename = (...args) => (IDBFS.queuePersist(mnt.mount), memfs_node_ops.rename(...args))
        }
        return mnt
    },
    syncfs: (mount, populate, callback) => {
        IDBFS.getLocalSet(mount, (err, local) => {
            if (err) return callback(err);
            IDBFS.getRemoteSet(mount, (err, remote) => {
                if (err) return callback(err);
                var src = populate ? remote : local;
                var dst = populate ? local : remote;
                IDBFS.reconcile(src, dst, callback)
            })
        })
    },
    quit: () => {
        for (var value of Object.values(IDBFS.dbs)) {
            value.close()
        }
        IDBFS.dbs = {}
    },
    getDB: (name, callback) => {
        var db = IDBFS.dbs[name];
        if (db) {
            return callback(null, db)
        }
        var req;
        try {
            req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION)
        } catch (e) {
            return callback(e)
        }
        if (!req) {
            return callback("Unable to connect to IndexedDB")
        }
        req.onupgradeneeded = e => {
            var db = e.target.result;
            var transaction = e.target.transaction;
            var fileStore;
            if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
                fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME)
            } else {
                fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME)
            }
            if (!fileStore.indexNames.contains("timestamp")) {
                fileStore.createIndex("timestamp", "timestamp", {
                    unique: false
                })
            }
        };
        req.onsuccess = () => {
            db = req.result;
            IDBFS.dbs[name] = db;
            callback(null, db)
        };
        req.onerror = e => {
            callback(e.target.error);
            e.preventDefault()
        }
    },
    getLocalSet: (mount, callback) => {
        var entries = {};

        function isRealDir(p) {
            return p !== "." && p !== ".."
        }

        function toAbsolute(root) {
            return p => PATH.join2(root, p)
        }
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
        while (check.length) {
            var path = check.pop();
            var stat;
            try {
                stat = FS.stat(path)
            } catch (e) {
                return callback(e)
            }
            if (FS.isDir(stat.mode)) {
                check.push(...FS.readdir(path).filter(isRealDir).map(toAbsolute(path)))
            }
            entries[path] = {
                timestamp: stat.mtime
            }
        }
        return callback(null, {
            type: "local",
            entries
        })
    },
    getRemoteSet: (mount, callback) => {
        var entries = {};
        IDBFS.getDB(mount.mountpoint, (err, db) => {
            if (err) return callback(err);
            try {
                var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readonly");
                transaction.onerror = e => {
                    callback(e.target.error);
                    e.preventDefault()
                };
                var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
                var index = store.index("timestamp");
                index.openKeyCursor().onsuccess = event => {
                    var cursor = event.target.result;
                    if (!cursor) {
                        return callback(null, {
                            type: "remote",
                            db,
                            entries
                        })
                    }
                    entries[cursor.primaryKey] = {
                        timestamp: cursor.key
                    };
                    cursor.continue()
                }
            } catch (e) {
                return callback(e)
            }
        })
    },
    loadLocalEntry: (path, callback) => {
        var stat, node;
        try {
            var lookup = FS.lookupPath(path);
            node = lookup.node;
            stat = FS.stat(path)
        } catch (e) {
            return callback(e)
        }
        if (FS.isDir(stat.mode)) {
            return callback(null, {
                timestamp: stat.mtime,
                mode: stat.mode
            })
        } else if (FS.isFile(stat.mode)) {
            node.contents = MEMFS.getFileDataAsTypedArray(node);
            return callback(null, {
                timestamp: stat.mtime,
                mode: stat.mode,
                contents: node.contents
            })
        } else {
            return callback(new Error("node type not supported"))
        }
    },
    storeLocalEntry: (path, entry, callback) => {
        try {
            if (FS.isDir(entry["mode"])) {
                FS.mkdirTree(path, entry["mode"])
            } else if (FS.isFile(entry["mode"])) {
                FS.writeFile(path, entry["contents"], {
                    canOwn: true
                })
            } else {
                return callback(new Error("node type not supported"))
            }
            FS.chmod(path, entry["mode"]);
            FS.utime(path, entry["timestamp"], entry["timestamp"])
        } catch (e) {
            return callback(e)
        }
        callback(null)
    },
    removeLocalEntry: (path, callback) => {
        try {
            var stat = FS.stat(path);
            if (FS.isDir(stat.mode)) {
                FS.rmdir(path)
            } else if (FS.isFile(stat.mode)) {
                FS.unlink(path)
            }
        } catch (e) {
            return callback(e)
        }
        callback(null)
    },
    loadRemoteEntry: (store, path, callback) => {
        var req = store.get(path);
        req.onsuccess = event => callback(null, event.target.result);
        req.onerror = e => {
            callback(e.target.error);
            e.preventDefault()
        }
    },
    storeRemoteEntry: (store, path, entry, callback) => {
        try {
            var req = store.put(entry, path)
        } catch (e) {
            callback(e);
            return
        }
        req.onsuccess = event => callback();
        req.onerror = e => {
            callback(e.target.error);
            e.preventDefault()
        }
    },
    removeRemoteEntry: (store, path, callback) => {
        var req = store.delete(path);
        req.onsuccess = event => callback();
        req.onerror = e => {
            callback(e.target.error);
            e.preventDefault()
        }
    },
    reconcile: (src, dst, callback) => {
        var total = 0;
        var create = [];
        for (var [key, e] of Object.entries(src.entries)) {
            var e2 = dst.entries[key];
            if (!e2 || e["timestamp"].getTime() != e2["timestamp"].getTime()) {
                create.push(key);
                total++
            }
        }
        var remove = [];
        for (var key of Object.keys(dst.entries)) {
            if (!src.entries[key]) {
                remove.push(key);
                total++
            }
        }
        if (!total) {
            return callback(null)
        }
        var errored = false;
        var db = src.type === "remote" ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readwrite");
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);

        function done(err) {
            if (err && !errored) {
                errored = true;
                return callback(err)
            }
        }
        transaction.onerror = transaction.onabort = e => {
            done(e.target.error);
            e.preventDefault()
        };
        transaction.oncomplete = e => {
            if (!errored) {
                callback(null)
            }
        };
        for (const path of create.sort()) {
            if (dst.type === "local") {
                IDBFS.loadRemoteEntry(store, path, (err, entry) => {
                    if (err) return done(err);
                    IDBFS.storeLocalEntry(path, entry, done)
                })
            } else {
                IDBFS.loadLocalEntry(path, (err, entry) => {
                    if (err) return done(err);
                    IDBFS.storeRemoteEntry(store, path, entry, done)
                })
            }
        }
        for (var path of remove.sort().reverse()) {
            if (dst.type === "local") {
                IDBFS.removeLocalEntry(path, done)
            } else {
                IDBFS.removeRemoteEntry(store, path, done)
            }
        }
    }
};
var asyncLoad = async url => {
    var arrayBuffer = await readAsync(url);
    return new Uint8Array(arrayBuffer)
};
var FS_createDataFile = (...args) => FS.createDataFile(...args);
var getUniqueRunDependency = id => id;
var preloadPlugins = [];
var FS_handledByPreloadPlugin = async (byteArray, fullname) => {
    if (typeof Browser != "undefined") Browser.init();
    for (var plugin of preloadPlugins) {
        if (plugin["canHandle"](fullname)) {
            return plugin["handle"](byteArray, fullname)
        }
    }
    return byteArray
};
var FS_preloadFile = async (parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish) => {
    var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
    var dep = getUniqueRunDependency(`cp ${fullname}`);
    addRunDependency(dep);
    try {
        var byteArray = url;
        if (typeof url == "string") {
            byteArray = await asyncLoad(url)
        }
        byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);
        preFinish?.();
        if (!dontCreateFile) {
            FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn)
        }
    } finally {
        removeRunDependency(dep)
    }
};
var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
    FS_preloadFile(parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish).then(onload).catch(onerror)
};
var FS = {
    root: null,
    mounts: [],
    devices: {},
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: "/",
    initialized: false,
    ignorePermissions: true,
    filesystems: null,
    syncFSRequests: 0,
    readFiles: {},
    ErrnoError: class {
        name = "ErrnoError";
        constructor(errno) {
            this.errno = errno
        }
    },
    FSStream: class {
        shared = {};
        get object() {
            return this.node
        }
        set object(val) {
            this.node = val
        }
        get isRead() {
            return (this.flags & 2097155) !== 1
        }
        get isWrite() {
            return (this.flags & 2097155) !== 0
        }
        get isAppend() {
            return this.flags & 1024
        }
        get flags() {
            return this.shared.flags
        }
        set flags(val) {
            this.shared.flags = val
        }
        get position() {
            return this.shared.position
        }
        set position(val) {
            this.shared.position = val
        }
    },
    FSNode: class {
        node_ops = {};
        stream_ops = {};
        readMode = 292 | 73;
        writeMode = 146;
        mounted = null;
        constructor(parent, name, mode, rdev) {
            if (!parent) {
                parent = this
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.rdev = rdev;
            this.atime = this.mtime = this.ctime = Date.now()
        }
        get read() {
            return (this.mode & this.readMode) === this.readMode
        }
        set read(val) {
            val ? this.mode |= this.readMode : this.mode &= ~this.readMode
        }
        get write() {
            return (this.mode & this.writeMode) === this.writeMode
        }
        set write(val) {
            val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode
        }
        get isFolder() {
            return FS.isDir(this.mode)
        }
        get isDevice() {
            return FS.isChrdev(this.mode)
        }
    },
    lookupPath(path, opts = {}) {
        if (!path) {
            throw new FS.ErrnoError(44)
        }
        opts.follow_mount ??= true;
        if (!PATH.isAbs(path)) {
            path = FS.cwd() + "/" + path
        }
        linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
            var parts = path.split("/").filter(p => !!p);
            var current = FS.root;
            var current_path = "/";
            for (var i = 0; i < parts.length; i++) {
                var islast = i === parts.length - 1;
                if (islast && opts.parent) {
                    break
                }
                if (parts[i] === ".") {
                    continue
                }
                if (parts[i] === "..") {
                    current_path = PATH.dirname(current_path);
                    if (FS.isRoot(current)) {
                        path = current_path + "/" + parts.slice(i + 1).join("/");
                        nlinks--;
                        continue linkloop
                    } else {
                        current = current.parent
                    }
                    continue
                }
                current_path = PATH.join2(current_path, parts[i]);
                try {
                    current = FS.lookupNode(current, parts[i])
                } catch (e) {
                    if (e?.errno === 44 && islast && opts.noent_okay) {
                        return {
                            path: current_path
                        }
                    }
                    throw e
                }
                if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
                    current = current.mounted.root
                }
                if (FS.isLink(current.mode) && (!islast || opts.follow)) {
                    if (!current.node_ops.readlink) {
                        throw new FS.ErrnoError(52)
                    }
                    var link = current.node_ops.readlink(current);
                    if (!PATH.isAbs(link)) {
                        link = PATH.dirname(current_path) + "/" + link
                    }
                    path = link + "/" + parts.slice(i + 1).join("/");
                    continue linkloop
                }
            }
            return {
                path: current_path,
                node: current
            }
        }
        throw new FS.ErrnoError(32)
    },
    getPath(node) {
        var path;
        while (true) {
            if (FS.isRoot(node)) {
                var mount = node.mount.mountpoint;
                if (!path) return mount;
                return mount[mount.length - 1] !== "/" ? `${mount}/${path}` : mount + path
            }
            path = path ? `${node.name}/${path}` : node.name;
            node = node.parent
        }
    },
    hashName(parentid, name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i) | 0
        }
        return (parentid + hash >>> 0) % FS.nameTable.length
    },
    hashAddNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node
    },
    hashRemoveNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
            FS.nameTable[hash] = node.name_next
        } else {
            var current = FS.nameTable[hash];
            while (current) {
                if (current.name_next === node) {
                    current.name_next = node.name_next;
                    break
                }
                current = current.name_next
            }
        }
    },
    lookupNode(parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
            var nodeName = node.name;
            if (node.parent.id === parent.id && nodeName === name) {
                return node
            }
        }
        return FS.lookup(parent, name)
    },
    createNode(parent, name, mode, rdev) {
        var node = new FS.FSNode(parent, name, mode, rdev);
        FS.hashAddNode(node);
        return node
    },
    destroyNode(node) {
        FS.hashRemoveNode(node)
    },
    isRoot(node) {
        return node === node.parent
    },
    isMountpoint(node) {
        return !!node.mounted
    },
    isFile(mode) {
        return (mode & 61440) === 32768
    },
    isDir(mode) {
        return (mode & 61440) === 16384
    },
    isLink(mode) {
        return (mode & 61440) === 40960
    },
    isChrdev(mode) {
        return (mode & 61440) === 8192
    },
    isBlkdev(mode) {
        return (mode & 61440) === 24576
    },
    isFIFO(mode) {
        return (mode & 61440) === 4096
    },
    isSocket(mode) {
        return (mode & 49152) === 49152
    },
    flagsToPermissionString(flag) {
        var perms = ["r", "w", "rw"][flag & 3];
        if (flag & 512) {
            perms += "w"
        }
        return perms
    },
    nodePermissions(node, perms) {
        if (FS.ignorePermissions) {
            return 0
        }
        if (perms.includes("r") && !(node.mode & 292)) {
            return 2
        } else if (perms.includes("w") && !(node.mode & 146)) {
            return 2
        } else if (perms.includes("x") && !(node.mode & 73)) {
            return 2
        }
        return 0
    },
    mayLookup(dir) {
        if (!FS.isDir(dir.mode)) return 54;
        var errCode = FS.nodePermissions(dir, "x");
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0
    },
    mayCreate(dir, name) {
        if (!FS.isDir(dir.mode)) {
            return 54
        }
        try {
            var node = FS.lookupNode(dir, name);
            return 20
        } catch (e) {}
        return FS.nodePermissions(dir, "wx")
    },
    mayDelete(dir, name, isdir) {
        var node;
        try {
            node = FS.lookupNode(dir, name)
        } catch (e) {
            return e.errno
        }
        var errCode = FS.nodePermissions(dir, "wx");
        if (errCode) {
            return errCode
        }
        if (isdir) {
            if (!FS.isDir(node.mode)) {
                return 54
            }
            if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
                return 10
            }
        } else {
            if (FS.isDir(node.mode)) {
                return 31
            }
        }
        return 0
    },
    mayOpen(node, flags) {
        if (!node) {
            return 44
        }
        if (FS.isLink(node.mode)) {
            return 32
        } else if (FS.isDir(node.mode)) {
            if (FS.flagsToPermissionString(flags) !== "r" || flags & (512 | 64)) {
                return 31
            }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags))
    },
    checkOpExists(op, err) {
        if (!op) {
            throw new FS.ErrnoError(err)
        }
        return op
    },
    MAX_OPEN_FDS: 4096,
    nextfd() {
        for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
            if (!FS.streams[fd]) {
                return fd
            }
        }
        throw new FS.ErrnoError(33)
    },
    getStreamChecked(fd) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(8)
        }
        return stream
    },
    getStream: fd => FS.streams[fd],
    createStream(stream, fd = -1) {
        stream = Object.assign(new FS.FSStream, stream);
        if (fd == -1) {
            fd = FS.nextfd()
        }
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream
    },
    closeStream(fd) {
        FS.streams[fd] = null
    },
    dupStream(origStream, fd = -1) {
        var stream = FS.createStream(origStream, fd);
        stream.stream_ops?.dup?.(stream);
        return stream
    },
    doSetAttr(stream, node, attr) {
        var setattr = stream?.stream_ops.setattr;
        var arg = setattr ? stream : node;
        setattr ??= node.node_ops.setattr;
        FS.checkOpExists(setattr, 63);
        setattr(arg, attr)
    },
    chrdev_stream_ops: {
        open(stream) {
            var device = FS.getDevice(stream.node.rdev);
            stream.stream_ops = device.stream_ops;
            stream.stream_ops.open?.(stream)
        },
        llseek() {
            throw new FS.ErrnoError(70)
        }
    },
    major: dev => dev >> 8,
    minor: dev => dev & 255,
    makedev: (ma, mi) => ma << 8 | mi,
    registerDevice(dev, ops) {
        FS.devices[dev] = {
            stream_ops: ops
        }
    },
    getDevice: dev => FS.devices[dev],
    getMounts(mount) {
        var mounts = [];
        var check = [mount];
        while (check.length) {
            var m = check.pop();
            mounts.push(m);
            check.push(...m.mounts)
        }
        return mounts
    },
    syncfs(populate, callback) {
        if (typeof populate == "function") {
            callback = populate;
            populate = false
        }
        FS.syncFSRequests++;
        if (FS.syncFSRequests > 1) {
            err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`)
        }
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;

        function doCallback(errCode) {
            FS.syncFSRequests--;
            return callback(errCode)
        }

        function done(errCode) {
            if (errCode) {
                if (!done.errored) {
                    done.errored = true;
                    return doCallback(errCode)
                }
                return
            }
            if (++completed >= mounts.length) {
                doCallback(null)
            }
        }
        for (var mount of mounts) {
            if (mount.type.syncfs) {
                mount.type.syncfs(mount, populate, done)
            } else {
                done(null)
            }
        }
    },
    mount(type, opts, mountpoint) {
        var root = mountpoint === "/";
        var pseudo = !mountpoint;
        var node;
        if (root && FS.root) {
            throw new FS.ErrnoError(10)
        } else if (!root && !pseudo) {
            var lookup = FS.lookupPath(mountpoint, {
                follow_mount: false
            });
            mountpoint = lookup.path;
            node = lookup.node;
            if (FS.isMountpoint(node)) {
                throw new FS.ErrnoError(10)
            }
            if (!FS.isDir(node.mode)) {
                throw new FS.ErrnoError(54)
            }
        }
        var mount = {
            type,
            opts,
            mountpoint,
            mounts: []
        };
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
        if (root) {
            FS.root = mountRoot
        } else if (node) {
            node.mounted = mount;
            if (node.mount) {
                node.mount.mounts.push(mount)
            }
        }
        return mountRoot
    },
    unmount(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, {
            follow_mount: false
        });
        if (!FS.isMountpoint(lookup.node)) {
            throw new FS.ErrnoError(28)
        }
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
        for (var [hash, current] of Object.entries(FS.nameTable)) {
            while (current) {
                var next = current.name_next;
                if (mounts.includes(current.mount)) {
                    FS.destroyNode(current)
                }
                current = next
            }
        }
        node.mounted = null;
        var idx = node.mount.mounts.indexOf(mount);
        node.mount.mounts.splice(idx, 1)
    },
    lookup(parent, name) {
        return parent.node_ops.lookup(parent, name)
    },
    mknod(path, mode, dev) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name) {
            throw new FS.ErrnoError(28)
        }
        if (name === "." || name === "..") {
            throw new FS.ErrnoError(20)
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!parent.node_ops.mknod) {
            throw new FS.ErrnoError(63)
        }
        return parent.node_ops.mknod(parent, name, mode, dev)
    },
    statfs(path) {
        return FS.statfsNode(FS.lookupPath(path, {
            follow: true
        }).node)
    },
    statfsStream(stream) {
        return FS.statfsNode(stream.node)
    },
    statfsNode(node) {
        var rtn = {
            bsize: 4096,
            frsize: 4096,
            blocks: 1e6,
            bfree: 5e5,
            bavail: 5e5,
            files: FS.nextInode,
            ffree: FS.nextInode - 1,
            fsid: 42,
            flags: 2,
            namelen: 255
        };
        if (node.node_ops.statfs) {
            Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root))
        }
        return rtn
    },
    create(path, mode = 438) {
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0)
    },
    mkdir(path, mode = 511) {
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0)
    },
    mkdirTree(path, mode) {
        var dirs = path.split("/");
        var d = "";
        for (var dir of dirs) {
            if (!dir) continue;
            if (d || PATH.isAbs(path)) d += "/";
            d += dir;
            try {
                FS.mkdir(d, mode)
            } catch (e) {
                if (e.errno != 20) throw e
            }
        }
    },
    mkdev(path, mode, dev) {
        if (typeof dev == "undefined") {
            dev = mode;
            mode = 438
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev)
    },
    symlink(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
            throw new FS.ErrnoError(44)
        }
        var lookup = FS.lookupPath(newpath, {
            parent: true
        });
        var parent = lookup.node;
        if (!parent) {
            throw new FS.ErrnoError(44)
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!parent.node_ops.symlink) {
            throw new FS.ErrnoError(63)
        }
        return parent.node_ops.symlink(parent, newname, oldpath)
    },
    rename(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        var lookup, old_dir, new_dir;
        lookup = FS.lookupPath(old_path, {
            parent: true
        });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, {
            parent: true
        });
        new_dir = lookup.node;
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        if (old_dir.mount !== new_dir.mount) {
            throw new FS.ErrnoError(75)
        }
        var old_node = FS.lookupNode(old_dir, old_name);
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(28)
        }
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(55)
        }
        var new_node;
        try {
            new_node = FS.lookupNode(new_dir, new_name)
        } catch (e) {}
        if (old_node === new_node) {
            return
        }
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!old_dir.node_ops.rename) {
            throw new FS.ErrnoError(63)
        }
        if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
            throw new FS.ErrnoError(10)
        }
        if (new_dir !== old_dir) {
            errCode = FS.nodePermissions(old_dir, "w");
            if (errCode) {
                throw new FS.ErrnoError(errCode)
            }
        }
        FS.hashRemoveNode(old_node);
        try {
            old_dir.node_ops.rename(old_node, new_dir, new_name);
            old_node.parent = new_dir
        } catch (e) {
            throw e
        } finally {
            FS.hashAddNode(old_node)
        }
    },
    rmdir(path) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!parent.node_ops.rmdir) {
            throw new FS.ErrnoError(63)
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10)
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node)
    },
    readdir(path) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
        return readdir(node)
    },
    unlink(path) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        if (!parent) {
            throw new FS.ErrnoError(44)
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!parent.node_ops.unlink) {
            throw new FS.ErrnoError(63)
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10)
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node)
    },
    readlink(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
            throw new FS.ErrnoError(44)
        }
        if (!link.node_ops.readlink) {
            throw new FS.ErrnoError(28)
        }
        return link.node_ops.readlink(link)
    },
    stat(path, dontFollow) {
        var lookup = FS.lookupPath(path, {
            follow: !dontFollow
        });
        var node = lookup.node;
        var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
        return getattr(node)
    },
    fstat(fd) {
        var stream = FS.getStreamChecked(fd);
        var node = stream.node;
        var getattr = stream.stream_ops.getattr;
        var arg = getattr ? stream : node;
        getattr ??= node.node_ops.getattr;
        FS.checkOpExists(getattr, 63);
        return getattr(arg)
    },
    lstat(path) {
        return FS.stat(path, true)
    },
    doChmod(stream, node, mode, dontFollow) {
        FS.doSetAttr(stream, node, {
            mode: mode & 4095 | node.mode & ~4095,
            ctime: Date.now(),
            dontFollow
        })
    },
    chmod(path, mode, dontFollow) {
        var node;
        if (typeof path == "string") {
            var lookup = FS.lookupPath(path, {
                follow: !dontFollow
            });
            node = lookup.node
        } else {
            node = path
        }
        FS.doChmod(null, node, mode, dontFollow)
    },
    lchmod(path, mode) {
        FS.chmod(path, mode, true)
    },
    fchmod(fd, mode) {
        var stream = FS.getStreamChecked(fd);
        FS.doChmod(stream, stream.node, mode, false)
    },
    doChown(stream, node, dontFollow) {
        FS.doSetAttr(stream, node, {
            timestamp: Date.now(),
            dontFollow
        })
    },
    chown(path, uid, gid, dontFollow) {
        var node;
        if (typeof path == "string") {
            var lookup = FS.lookupPath(path, {
                follow: !dontFollow
            });
            node = lookup.node
        } else {
            node = path
        }
        FS.doChown(null, node, dontFollow)
    },
    lchown(path, uid, gid) {
        FS.chown(path, uid, gid, true)
    },
    fchown(fd, uid, gid) {
        var stream = FS.getStreamChecked(fd);
        FS.doChown(stream, stream.node, false)
    },
    doTruncate(stream, node, len) {
        if (FS.isDir(node.mode)) {
            throw new FS.ErrnoError(31)
        }
        if (!FS.isFile(node.mode)) {
            throw new FS.ErrnoError(28)
        }
        var errCode = FS.nodePermissions(node, "w");
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        FS.doSetAttr(stream, node, {
            size: len,
            timestamp: Date.now()
        })
    },
    truncate(path, len) {
        if (len < 0) {
            throw new FS.ErrnoError(28)
        }
        var node;
        if (typeof path == "string") {
            var lookup = FS.lookupPath(path, {
                follow: true
            });
            node = lookup.node
        } else {
            node = path
        }
        FS.doTruncate(null, node, len)
    },
    ftruncate(fd, len) {
        var stream = FS.getStreamChecked(fd);
        if (len < 0 || (stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(28)
        }
        FS.doTruncate(stream, stream.node, len)
    },
    utime(path, atime, mtime) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        var setattr = FS.checkOpExists(node.node_ops.setattr, 63);
        setattr(node, {
            atime,
            mtime
        })
    },
    open(path, flags, mode = 438) {
        if (path === "") {
            throw new FS.ErrnoError(44)
        }
        flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
        if (flags & 64) {
            mode = mode & 4095 | 32768
        } else {
            mode = 0
        }
        var node;
        var isDirPath;
        if (typeof path == "object") {
            node = path
        } else {
            isDirPath = path.endsWith("/");
            var lookup = FS.lookupPath(path, {
                follow: !(flags & 131072),
                noent_okay: true
            });
            node = lookup.node;
            path = lookup.path
        }
        var created = false;
        if (flags & 64) {
            if (node) {
                if (flags & 128) {
                    throw new FS.ErrnoError(20)
                }
            } else if (isDirPath) {
                throw new FS.ErrnoError(31)
            } else {
                node = FS.mknod(path, mode | 511, 0);
                created = true
            }
        }
        if (!node) {
            throw new FS.ErrnoError(44)
        }
        if (FS.isChrdev(node.mode)) {
            flags &= ~512
        }
        if (flags & 65536 && !FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54)
        }
        if (!created) {
            var errCode = FS.mayOpen(node, flags);
            if (errCode) {
                throw new FS.ErrnoError(errCode)
            }
        }
        if (flags & 512 && !created) {
            FS.truncate(node, 0)
        }
        flags &= ~(128 | 512 | 131072);
        var stream = FS.createStream({
            node,
            path: FS.getPath(node),
            flags,
            seekable: true,
            position: 0,
            stream_ops: node.stream_ops,
            ungotten: [],
            error: false
        });
        if (stream.stream_ops.open) {
            stream.stream_ops.open(stream)
        }
        if (created) {
            FS.chmod(node, mode & 511)
        }
        if (Module["logReadFiles"] && !(flags & 1)) {
            if (!(path in FS.readFiles)) {
                FS.readFiles[path] = 1
            }
        }
        return stream
    },
    close(stream) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if (stream.getdents) stream.getdents = null;
        try {
            if (stream.stream_ops.close) {
                stream.stream_ops.close(stream)
            }
        } catch (e) {
            throw e
        } finally {
            FS.closeStream(stream.fd)
        }
        stream.fd = null
    },
    isClosed(stream) {
        return stream.fd === null
    },
    llseek(stream, offset, whence) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
            throw new FS.ErrnoError(70)
        }
        if (whence != 0 && whence != 1 && whence != 2) {
            throw new FS.ErrnoError(28)
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position
    },
    read(stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(28)
        }
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(8)
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(31)
        }
        if (!stream.stream_ops.read) {
            throw new FS.ErrnoError(28)
        }
        var seeking = typeof position != "undefined";
        if (!seeking) {
            position = stream.position
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(70)
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead
    },
    write(stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(28)
        }
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(8)
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(31)
        }
        if (!stream.stream_ops.write) {
            throw new FS.ErrnoError(28)
        }
        if (stream.seekable && stream.flags & 1024) {
            FS.llseek(stream, 0, 2)
        }
        var seeking = typeof position != "undefined";
        if (!seeking) {
            position = stream.position
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(70)
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten
    },
    mmap(stream, length, position, prot, flags) {
        if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
            throw new FS.ErrnoError(2)
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(2)
        }
        if (!stream.stream_ops.mmap) {
            throw new FS.ErrnoError(43)
        }
        if (!length) {
            throw new FS.ErrnoError(28)
        }
        return stream.stream_ops.mmap(stream, length, position, prot, flags)
    },
    msync(stream, buffer, offset, length, mmapFlags) {
        if (!stream.stream_ops.msync) {
            return 0
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags)
    },
    ioctl(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
            throw new FS.ErrnoError(59)
        }
        return stream.stream_ops.ioctl(stream, cmd, arg)
    },
    readFile(path, opts = {}) {
        opts.flags = opts.flags || 0;
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            abort(`Invalid encoding type "${opts.encoding}"`)
        }
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === "utf8") {
            buf = UTF8ArrayToString(buf)
        }
        FS.close(stream);
        return buf
    },
    writeFile(path, data, opts = {}) {
        opts.flags = opts.flags || 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data == "string") {
            data = new Uint8Array(intArrayFromString(data, true))
        }
        if (ArrayBuffer.isView(data)) {
            FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn)
        } else {
            abort("Unsupported data type")
        }
        FS.close(stream)
    },
    cwd: () => FS.currentPath,
    chdir(path) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        if (lookup.node === null) {
            throw new FS.ErrnoError(44)
        }
        if (!FS.isDir(lookup.node.mode)) {
            throw new FS.ErrnoError(54)
        }
        var errCode = FS.nodePermissions(lookup.node, "x");
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        FS.currentPath = lookup.path
    },
    createDefaultDirectories() {
        FS.mkdir("/tmp");
        FS.mkdir("/home");
        FS.mkdir("/home/web_user")
    },
    createDefaultDevices() {
        FS.mkdir("/dev");
        FS.registerDevice(FS.makedev(1, 3), {
            read: () => 0,
            write: (stream, buffer, offset, length, pos) => length,
            llseek: () => 0
        });
        FS.mkdev("/dev/null", FS.makedev(1, 3));
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev("/dev/tty", FS.makedev(5, 0));
        FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var randomBuffer = new Uint8Array(1024),
            randomLeft = 0;
        var randomByte = () => {
            if (randomLeft === 0) {
                randomFill(randomBuffer);
                randomLeft = randomBuffer.byteLength
            }
            return randomBuffer[--randomLeft]
        };
        FS.createDevice("/dev", "random", randomByte);
        FS.createDevice("/dev", "urandom", randomByte);
        FS.mkdir("/dev/shm");
        FS.mkdir("/dev/shm/tmp")
    },
    createSpecialDirectories() {
        FS.mkdir("/proc");
        var proc_self = FS.mkdir("/proc/self");
        FS.mkdir("/proc/self/fd");
        FS.mount({
            mount() {
                var node = FS.createNode(proc_self, "fd", 16895, 73);
                node.stream_ops = {
                    llseek: MEMFS.stream_ops.llseek
                };
                node.node_ops = {
                    lookup(parent, name) {
                        var fd = +name;
                        var stream = FS.getStreamChecked(fd);
                        var ret = {
                            parent: null,
                            mount: {
                                mountpoint: "fake"
                            },
                            node_ops: {
                                readlink: () => stream.path
                            },
                            id: fd + 1
                        };
                        ret.parent = ret;
                        return ret
                    },
                    readdir() {
                        return Array.from(FS.streams.entries()).filter(([k, v]) => v).map(([k, v]) => k.toString())
                    }
                };
                return node
            }
        }, {}, "/proc/self/fd")
    },
    createStandardStreams(input, output, error) {
        if (input) {
            FS.createDevice("/dev", "stdin", input)
        } else {
            FS.symlink("/dev/tty", "/dev/stdin")
        }
        if (output) {
            FS.createDevice("/dev", "stdout", null, output)
        } else {
            FS.symlink("/dev/tty", "/dev/stdout")
        }
        if (error) {
            FS.createDevice("/dev", "stderr", null, error)
        } else {
            FS.symlink("/dev/tty1", "/dev/stderr")
        }
        var stdin = FS.open("/dev/stdin", 0);
        var stdout = FS.open("/dev/stdout", 1);
        var stderr = FS.open("/dev/stderr", 1)
    },
    staticInit() {
        FS.nameTable = new Array(4096);
        FS.mount(MEMFS, {}, "/");
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
        FS.filesystems = {
            MEMFS,
            IDBFS
        }
    },
    init(input, output, error) {
        FS.initialized = true;
        input ??= Module["stdin"];
        output ??= Module["stdout"];
        error ??= Module["stderr"];
        FS.createStandardStreams(input, output, error)
    },
    quit() {
        FS.initialized = false;
        _fflush(0);
        for (var stream of FS.streams) {
            if (stream) {
                FS.close(stream)
            }
        }
    },
    findObject(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (!ret.exists) {
            return null
        }
        return ret.object
    },
    analyzePath(path, dontResolveLastLink) {
        try {
            var lookup = FS.lookupPath(path, {
                follow: !dontResolveLastLink
            });
            path = lookup.path
        } catch (e) {}
        var ret = {
            isRoot: false,
            exists: false,
            error: 0,
            name: null,
            path: null,
            object: null,
            parentExists: false,
            parentPath: null,
            parentObject: null
        };
        try {
            var lookup = FS.lookupPath(path, {
                parent: true
            });
            ret.parentExists = true;
            ret.parentPath = lookup.path;
            ret.parentObject = lookup.node;
            ret.name = PATH.basename(path);
            lookup = FS.lookupPath(path, {
                follow: !dontResolveLastLink
            });
            ret.exists = true;
            ret.path = lookup.path;
            ret.object = lookup.node;
            ret.name = lookup.node.name;
            ret.isRoot = lookup.path === "/"
        } catch (e) {
            ret.error = e.errno
        }
        return ret
    },
    createPath(parent, path, canRead, canWrite) {
        parent = typeof parent == "string" ? parent : FS.getPath(parent);
        var parts = path.split("/").reverse();
        while (parts.length) {
            var part = parts.pop();
            if (!part) continue;
            var current = PATH.join2(parent, part);
            try {
                FS.mkdir(current)
            } catch (e) {
                if (e.errno != 20) throw e
            }
            parent = current
        }
        return current
    },
    createFile(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(canRead, canWrite);
        return FS.create(path, mode)
    },
    createDataFile(parent, name, data, canRead, canWrite, canOwn) {
        var path = name;
        if (parent) {
            parent = typeof parent == "string" ? parent : FS.getPath(parent);
            path = name ? PATH.join2(parent, name) : parent
        }
        var mode = FS_getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
            if (typeof data == "string") {
                var arr = new Array(data.length);
                for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
                data = arr
            }
            FS.chmod(node, mode | 146);
            var stream = FS.open(node, 577);
            FS.write(stream, data, 0, data.length, 0, canOwn);
            FS.close(stream);
            FS.chmod(node, mode)
        }
    },
    createDevice(parent, name, input, output) {
        var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(!!input, !!output);
        FS.createDevice.major ??= 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
            open(stream) {
                stream.seekable = false
            },
            close(stream) {
                if (output?.buffer?.length) {
                    output(10)
                }
            },
            read(stream, buffer, offset, length, pos) {
                var bytesRead = 0;
                for (var i = 0; i < length; i++) {
                    var result;
                    try {
                        result = input()
                    } catch (e) {
                        throw new FS.ErrnoError(29)
                    }
                    if (result === undefined && bytesRead === 0) {
                        throw new FS.ErrnoError(6)
                    }
                    if (result === null || result === undefined) break;
                    bytesRead++;
                    buffer[offset + i] = result
                }
                if (bytesRead) {
                    stream.node.atime = Date.now()
                }
                return bytesRead
            },
            write(stream, buffer, offset, length, pos) {
                for (var i = 0; i < length; i++) {
                    try {
                        output(buffer[offset + i])
                    } catch (e) {
                        throw new FS.ErrnoError(29)
                    }
                }
                if (length) {
                    stream.node.mtime = stream.node.ctime = Date.now()
                }
                return i
            }
        });
        return FS.mkdev(path, mode, dev)
    },
    forceLoadFile(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        if (globalThis.XMLHttpRequest) {
            abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")
        } else {
            try {
                obj.contents = readBinary(obj.url)
            } catch (e) {
                throw new FS.ErrnoError(29)
            }
        }
    },
    createLazyFile(parent, name, url, canRead, canWrite) {
        class LazyUint8Array {
            lengthKnown = false;
            chunks = [];
            get(idx) {
                if (idx > this.length - 1 || idx < 0) {
                    return undefined
                }
                var chunkOffset = idx % this.chunkSize;
                var chunkNum = idx / this.chunkSize | 0;
                return this.getter(chunkNum)[chunkOffset]
            }
            setDataGetter(getter) {
                this.getter = getter
            }
            cacheLength() {
                var xhr = new XMLHttpRequest;
                xhr.open("HEAD", url, false);
                xhr.send(null);
                if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort("Couldn't load " + url + ". Status: " + xhr.status);
                var datalength = Number(xhr.getResponseHeader("Content-length"));
                var header;
                var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
                var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
                var chunkSize = 1024 * 1024;
                if (!hasByteServing) chunkSize = datalength;
                var doXHR = (from, to) => {
                    if (from > to) abort("invalid range (" + from + ", " + to + ") or no bytes requested!");
                    if (to > datalength - 1) abort("only " + datalength + " bytes available! programmer error!");
                    var xhr = new XMLHttpRequest;
                    xhr.open("GET", url, false);
                    if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
                    xhr.responseType = "arraybuffer";
                    if (xhr.overrideMimeType) {
                        xhr.overrideMimeType("text/plain; charset=x-user-defined")
                    }
                    xhr.send(null);
                    if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort("Couldn't load " + url + ". Status: " + xhr.status);
                    if (xhr.response !== undefined) {
                        return new Uint8Array(xhr.response || [])
                    }
                    return intArrayFromString(xhr.responseText || "", true)
                };
                var lazyArray = this;
                lazyArray.setDataGetter(chunkNum => {
                    var start = chunkNum * chunkSize;
                    var end = (chunkNum + 1) * chunkSize - 1;
                    end = Math.min(end, datalength - 1);
                    if (typeof lazyArray.chunks[chunkNum] == "undefined") {
                        lazyArray.chunks[chunkNum] = doXHR(start, end)
                    }
                    if (typeof lazyArray.chunks[chunkNum] == "undefined") abort("doXHR failed!");
                    return lazyArray.chunks[chunkNum]
                });
                if (usesGzip || !datalength) {
                    chunkSize = datalength = 1;
                    datalength = this.getter(0).length;
                    chunkSize = datalength;
                    out("LazyFiles on gzip forces download of the whole file when length is accessed")
                }
                this._length = datalength;
                this._chunkSize = chunkSize;
                this.lengthKnown = true
            }
            get length() {
                if (!this.lengthKnown) {
                    this.cacheLength()
                }
                return this._length
            }
            get chunkSize() {
                if (!this.lengthKnown) {
                    this.cacheLength()
                }
                return this._chunkSize
            }
        }
        if (globalThis.XMLHttpRequest) {
            if (!ENVIRONMENT_IS_WORKER) abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
            var lazyArray = new LazyUint8Array;
            var properties = {
                isDevice: false,
                contents: lazyArray
            }
        } else {
            var properties = {
                isDevice: false,
                url
            }
        }
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        if (properties.contents) {
            node.contents = properties.contents
        } else if (properties.url) {
            node.contents = null;
            node.url = properties.url
        }
        Object.defineProperties(node, {
            usedBytes: {
                get: function() {
                    return this.contents.length
                }
            }
        });
        var stream_ops = {};
        for (const [key, fn] of Object.entries(node.stream_ops)) {
            stream_ops[key] = (...args) => {
                FS.forceLoadFile(node);
                return fn(...args)
            }
        }

        function writeChunks(stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= contents.length) return 0;
            var size = Math.min(contents.length - position, length);
            if (contents.slice) {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents[position + i]
                }
            } else {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents.get(position + i)
                }
            }
            return size
        }
        stream_ops.read = (stream, buffer, offset, length, position) => {
            FS.forceLoadFile(node);
            return writeChunks(stream, buffer, offset, length, position)
        };
        stream_ops.mmap = (stream, length, position, prot, flags) => {
            FS.forceLoadFile(node);
            var ptr = mmapAlloc(length);
            if (!ptr) {
                throw new FS.ErrnoError(48)
            }
            writeChunks(stream, HEAP8, ptr, length, position);
            return {
                ptr,
                allocated: true
            }
        };
        node.stream_ops = stream_ops;
        return node
    }
};
var SYSCALLS = {
    DEFAULT_POLLMASK: 5,
    calculateAt(dirfd, path, allowEmpty) {
        if (PATH.isAbs(path)) {
            return path
        }
        var dir;
        if (dirfd === -100) {
            dir = FS.cwd()
        } else {
            var dirstream = SYSCALLS.getStreamFromFD(dirfd);
            dir = dirstream.path
        }
        if (path.length == 0) {
            if (!allowEmpty) {
                throw new FS.ErrnoError(44)
            }
            return dir
        }
        return dir + "/" + path
    },
    writeStat(buf, stat) {
        HEAPU32[buf >> 2] = stat.dev;
        HEAPU32[buf + 4 >> 2] = stat.mode;
        HEAPU32[buf + 8 >> 2] = stat.nlink;
        HEAPU32[buf + 12 >> 2] = stat.uid;
        HEAPU32[buf + 16 >> 2] = stat.gid;
        HEAPU32[buf + 20 >> 2] = stat.rdev;
        HEAP64[buf + 24 >> 3] = BigInt(stat.size);
        HEAP32[buf + 32 >> 2] = 4096;
        HEAP32[buf + 36 >> 2] = stat.blocks;
        var atime = stat.atime.getTime();
        var mtime = stat.mtime.getTime();
        var ctime = stat.ctime.getTime();
        HEAP64[buf + 40 >> 3] = BigInt(Math.floor(atime / 1e3));
        HEAPU32[buf + 48 >> 2] = atime % 1e3 * 1e3 * 1e3;
        HEAP64[buf + 56 >> 3] = BigInt(Math.floor(mtime / 1e3));
        HEAPU32[buf + 64 >> 2] = mtime % 1e3 * 1e3 * 1e3;
        HEAP64[buf + 72 >> 3] = BigInt(Math.floor(ctime / 1e3));
        HEAPU32[buf + 80 >> 2] = ctime % 1e3 * 1e3 * 1e3;
        HEAP64[buf + 88 >> 3] = BigInt(stat.ino);
        return 0
    },
    writeStatFs(buf, stats) {
        HEAPU32[buf + 4 >> 2] = stats.bsize;
        HEAPU32[buf + 60 >> 2] = stats.bsize;
        HEAP64[buf + 8 >> 3] = BigInt(stats.blocks);
        HEAP64[buf + 16 >> 3] = BigInt(stats.bfree);
        HEAP64[buf + 24 >> 3] = BigInt(stats.bavail);
        HEAP64[buf + 32 >> 3] = BigInt(stats.files);
        HEAP64[buf + 40 >> 3] = BigInt(stats.ffree);
        HEAPU32[buf + 48 >> 2] = stats.fsid;
        HEAPU32[buf + 64 >> 2] = stats.flags;
        HEAPU32[buf + 56 >> 2] = stats.namelen
    },
    doMsync(addr, stream, len, flags, offset) {
        if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43)
        }
        if (flags & 2) {
            return 0
        }
        var buffer = HEAPU8.slice(addr, addr + len);
        FS.msync(stream, buffer, offset, len, flags)
    },
    getStreamFromFD(fd) {
        var stream = FS.getStreamChecked(fd);
        return stream
    },
    varargs: undefined,
    getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret
    }
};
var INT53_MAX = 9007199254740992;
var INT53_MIN = -9007199254740992;
var bigintToI53Checked = num => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);
var ___syscall__newselect = function(nfds, readfds, writefds, exceptfds, timeoutInMillis) {
    timeoutInMillis = bigintToI53Checked(timeoutInMillis);
    try {
        var total = 0;
        var srcReadLow = readfds ? HEAP32[readfds >> 2] : 0,
            srcReadHigh = readfds ? HEAP32[readfds + 4 >> 2] : 0;
        var srcWriteLow = writefds ? HEAP32[writefds >> 2] : 0,
            srcWriteHigh = writefds ? HEAP32[writefds + 4 >> 2] : 0;
        var srcExceptLow = exceptfds ? HEAP32[exceptfds >> 2] : 0,
            srcExceptHigh = exceptfds ? HEAP32[exceptfds + 4 >> 2] : 0;
        var dstReadLow = 0,
            dstReadHigh = 0;
        var dstWriteLow = 0,
            dstWriteHigh = 0;
        var dstExceptLow = 0,
            dstExceptHigh = 0;
        var allLow = srcReadLow | srcWriteLow | srcExceptLow;
        var allHigh = srcReadHigh | srcWriteHigh | srcExceptHigh;
        var check = (fd, low, high, val) => fd < 32 ? low & val : high & val;
        for (var fd = 0; fd < nfds; fd++) {
            var mask = 1 << fd % 32;
            if (!check(fd, allLow, allHigh, mask)) {
                continue
            }
            var stream = SYSCALLS.getStreamFromFD(fd);
            var flags = SYSCALLS.DEFAULT_POLLMASK;
            if (stream.stream_ops.poll) {
                flags = stream.stream_ops.poll(stream, timeoutInMillis)
            } else {}
            if (flags & 1 && check(fd, srcReadLow, srcReadHigh, mask)) {
                fd < 32 ? dstReadLow = dstReadLow | mask : dstReadHigh = dstReadHigh | mask;
                total++
            }
            if (flags & 4 && check(fd, srcWriteLow, srcWriteHigh, mask)) {
                fd < 32 ? dstWriteLow = dstWriteLow | mask : dstWriteHigh = dstWriteHigh | mask;
                total++
            }
            if (flags & 2 && check(fd, srcExceptLow, srcExceptHigh, mask)) {
                fd < 32 ? dstExceptLow = dstExceptLow | mask : dstExceptHigh = dstExceptHigh | mask;
                total++
            }
        }
        if (readfds) {
            HEAP32[readfds >> 2] = dstReadLow;
            HEAP32[readfds + 4 >> 2] = dstReadHigh
        }
        if (writefds) {
            HEAP32[writefds >> 2] = dstWriteLow;
            HEAP32[writefds + 4 >> 2] = dstWriteHigh
        }
        if (exceptfds) {
            HEAP32[exceptfds >> 2] = dstExceptLow;
            HEAP32[exceptfds + 4 >> 2] = dstExceptHigh
        }
        return total
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
};
var SOCKFS = {
    websocketArgs: {},
    callbacks: {},
    on(event, callback) {
        SOCKFS.callbacks[event] = callback
    },
    emit(event, param) {
        SOCKFS.callbacks[event]?.(param)
    },
    mount(mount) {
        SOCKFS.websocketArgs = Module["websocket"] || {};
        (Module["websocket"] ??= {})["on"] = SOCKFS.on;
        return FS.createNode(null, "/", 16895, 0)
    },
    createSocket(family, type, protocol) {
        if (family != 2) {
            throw new FS.ErrnoError(5)
        }
        type &= ~526336;
        if (type != 1 && type != 2) {
            throw new FS.ErrnoError(28)
        }
        var streaming = type == 1;
        if (streaming && protocol && protocol != 6) {
            throw new FS.ErrnoError(66)
        }
        var sock = {
            family,
            type,
            protocol,
            server: null,
            error: null,
            peers: {},
            pending: [],
            recv_queue: [],
            sock_ops: SOCKFS.websocket_sock_ops
        };
        var name = SOCKFS.nextname();
        var node = FS.createNode(SOCKFS.root, name, 49152, 0);
        node.sock = sock;
        var stream = FS.createStream({
            path: name,
            node,
            flags: 2,
            seekable: false,
            stream_ops: SOCKFS.stream_ops
        });
        sock.stream = stream;
        return sock
    },
    getSocket(fd) {
        var stream = FS.getStream(fd);
        if (!stream || !FS.isSocket(stream.node.mode)) {
            return null
        }
        return stream.node.sock
    },
    stream_ops: {
        poll(stream) {
            var sock = stream.node.sock;
            return sock.sock_ops.poll(sock)
        },
        ioctl(stream, request, varargs) {
            var sock = stream.node.sock;
            return sock.sock_ops.ioctl(sock, request, varargs)
        },
        read(stream, buffer, offset, length, position) {
            var sock = stream.node.sock;
            var msg = sock.sock_ops.recvmsg(sock, length);
            if (!msg) {
                return 0
            }
            buffer.set(msg.buffer, offset);
            return msg.buffer.length
        },
        write(stream, buffer, offset, length, position) {
            var sock = stream.node.sock;
            return sock.sock_ops.sendmsg(sock, buffer, offset, length)
        },
        close(stream) {
            var sock = stream.node.sock;
            sock.sock_ops.close(sock)
        }
    },
    nextname() {
        if (!SOCKFS.nextname.current) {
            SOCKFS.nextname.current = 0
        }
        return `socket[${SOCKFS.nextname.current++}]`
    },
    websocket_sock_ops: {
        createPeer(sock, addr, port) {
            var ws;
            if (typeof addr == "object") {
                ws = addr;
                addr = null;
                port = null
            }
            if (ws) {
                if (ws._socket) {
                    addr = ws._socket.remoteAddress;
                    port = ws._socket.remotePort
                } else {
                    var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
                    if (!result) {
                        throw new Error("WebSocket URL must be in the format ws(s)://address:port")
                    }
                    addr = result[1];
                    port = parseInt(result[2], 10)
                }
            } else {
                try {
                    var url = "ws://".replace("#", "//");
                    var subProtocols = "binary";
                    var opts = undefined;
                    if (SOCKFS.websocketArgs["url"]) {
                        url = SOCKFS.websocketArgs["url"]
                    }
                    if (SOCKFS.websocketArgs["subprotocol"]) {
                        subProtocols = SOCKFS.websocketArgs["subprotocol"]
                    } else if (SOCKFS.websocketArgs["subprotocol"] === null) {
                        subProtocols = "null"
                    }
                    if (url === "ws://" || url === "wss://") {
                        var parts = addr.split("/");
                        url = url + parts[0] + ":" + port + "/" + parts.slice(1).join("/")
                    }
                    if (subProtocols !== "null") {
                        subProtocols = subProtocols.replace(/^ +| +$/g, "").split(/ *, */);
                        opts = subProtocols
                    }
                    var WebSocketConstructor;
                    if (ENVIRONMENT_IS_NODE) {
                        WebSocketConstructor = require("ws")
                    } else {
                        WebSocketConstructor = WebSocket
                    }
                    ws = new WebSocketConstructor(url, opts);
                    ws.binaryType = "arraybuffer"
                } catch (e) {
                    throw new FS.ErrnoError(23)
                }
            }
            var peer = {
                addr,
                port,
                socket: ws,
                msg_send_queue: []
            };
            SOCKFS.websocket_sock_ops.addPeer(sock, peer);
            SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);
            if (sock.type === 2 && typeof sock.sport != "undefined") {
                peer.msg_send_queue.push(new Uint8Array([255, 255, 255, 255, "p".charCodeAt(0), "o".charCodeAt(0), "r".charCodeAt(0), "t".charCodeAt(0), (sock.sport & 65280) >> 8, sock.sport & 255]))
            }
            return peer
        },
        getPeer(sock, addr, port) {
            return sock.peers[addr + ":" + port]
        },
        addPeer(sock, peer) {
            sock.peers[peer.addr + ":" + peer.port] = peer
        },
        removePeer(sock, peer) {
            delete sock.peers[peer.addr + ":" + peer.port]
        },
        handlePeerEvents(sock, peer) {
            var first = true;
            var handleOpen = function() {
                sock.connecting = false;
                SOCKFS.emit("open", sock.stream.fd);
                try {
                    var queued = peer.msg_send_queue.shift();
                    while (queued) {
                        peer.socket.send(queued);
                        queued = peer.msg_send_queue.shift()
                    }
                } catch (e) {
                    peer.socket.close()
                }
            };

            function handleMessage(data) {
                if (typeof data == "string") {
                    var encoder = new TextEncoder;
                    data = encoder.encode(data)
                } else {
                    if (data.byteLength == 0) {
                        return
                    }
                    data = new Uint8Array(data)
                }
                var wasfirst = first;
                first = false;
                if (wasfirst && data.length === 10 && data[0] === 255 && data[1] === 255 && data[2] === 255 && data[3] === 255 && data[4] === "p".charCodeAt(0) && data[5] === "o".charCodeAt(0) && data[6] === "r".charCodeAt(0) && data[7] === "t".charCodeAt(0)) {
                    var newport = data[8] << 8 | data[9];
                    SOCKFS.websocket_sock_ops.removePeer(sock, peer);
                    peer.port = newport;
                    SOCKFS.websocket_sock_ops.addPeer(sock, peer);
                    return
                }
                sock.recv_queue.push({
                    addr: peer.addr,
                    port: peer.port,
                    data
                });
                SOCKFS.emit("message", sock.stream.fd)
            }
            if (ENVIRONMENT_IS_NODE) {
                peer.socket.on("open", handleOpen);
                peer.socket.on("message", function(data, isBinary) {
                    if (!isBinary) {
                        return
                    }
                    handleMessage(new Uint8Array(data).buffer)
                });
                peer.socket.on("close", function() {
                    SOCKFS.emit("close", sock.stream.fd)
                });
                peer.socket.on("error", function(error) {
                    sock.error = 14;
                    SOCKFS.emit("error", [sock.stream.fd, sock.error, "ECONNREFUSED: Connection refused"])
                })
            } else {
                peer.socket.onopen = handleOpen;
                peer.socket.onclose = function() {
                    SOCKFS.emit("close", sock.stream.fd)
                };
                peer.socket.onmessage = function peer_socket_onmessage(event) {
                    handleMessage(event.data)
                };
                peer.socket.onerror = function(error) {
                    sock.error = 14;
                    SOCKFS.emit("error", [sock.stream.fd, sock.error, "ECONNREFUSED: Connection refused"])
                }
            }
        },
        poll(sock) {
            if (sock.type === 1 && sock.server) {
                return sock.pending.length ? 64 | 1 : 0
            }
            var mask = 0;
            var dest = sock.type === 1 ? SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) : null;
            if (sock.recv_queue.length || !dest || dest && dest.socket.readyState === dest.socket.CLOSING || dest && dest.socket.readyState === dest.socket.CLOSED) {
                mask |= 64 | 1
            }
            if (!dest || dest && dest.socket.readyState === dest.socket.OPEN) {
                mask |= 4
            }
            if (dest && dest.socket.readyState === dest.socket.CLOSING || dest && dest.socket.readyState === dest.socket.CLOSED) {
                if (sock.connecting) {
                    mask |= 4
                } else {
                    mask |= 16
                }
            }
            return mask
        },
        ioctl(sock, request, arg) {
            switch (request) {
                case 21531:
                    var bytes = 0;
                    if (sock.recv_queue.length) {
                        bytes = sock.recv_queue[0].data.length
                    }
                    HEAP32[arg >> 2] = bytes;
                    return 0;
                case 21537:
                    var on = HEAP32[arg >> 2];
                    if (on) {
                        sock.stream.flags |= 2048
                    } else {
                        sock.stream.flags &= ~2048
                    }
                    return 0;
                default:
                    return 28
            }
        },
        close(sock) {
            if (sock.server) {
                try {
                    sock.server.close()
                } catch (e) {}
                sock.server = null
            }
            for (var peer of Object.values(sock.peers)) {
                try {
                    peer.socket.close()
                } catch (e) {}
                SOCKFS.websocket_sock_ops.removePeer(sock, peer)
            }
            return 0
        },
        bind(sock, addr, port) {
            if (typeof sock.saddr != "undefined" || typeof sock.sport != "undefined") {
                throw new FS.ErrnoError(28)
            }
            sock.saddr = addr;
            sock.sport = port;
            if (sock.type === 2) {
                if (sock.server) {
                    sock.server.close();
                    sock.server = null
                }
                try {
                    sock.sock_ops.listen(sock, 0)
                } catch (e) {
                    if (!(e.name === "ErrnoError")) throw e;
                    if (e.errno !== 138) throw e
                }
            }
        },
        connect(sock, addr, port) {
            if (sock.server) {
                throw new FS.ErrnoError(138)
            }
            if (typeof sock.daddr != "undefined" && typeof sock.dport != "undefined") {
                var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
                if (dest) {
                    if (dest.socket.readyState === dest.socket.CONNECTING) {
                        throw new FS.ErrnoError(7)
                    } else {
                        throw new FS.ErrnoError(30)
                    }
                }
            }
            var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
            sock.daddr = peer.addr;
            sock.dport = peer.port;
            sock.connecting = true
        },
        listen(sock, backlog) {
            if (!ENVIRONMENT_IS_NODE) {
                throw new FS.ErrnoError(138)
            }
            if (sock.server) {
                throw new FS.ErrnoError(28)
            }
            var WebSocketServer = require("ws").Server;
            var host = sock.saddr;
            sock.server = new WebSocketServer({
                host,
                port: sock.sport
            });
            SOCKFS.emit("listen", sock.stream.fd);
            sock.server.on("connection", function(ws) {
                if (sock.type === 1) {
                    var newsock = SOCKFS.createSocket(sock.family, sock.type, sock.protocol);
                    var peer = SOCKFS.websocket_sock_ops.createPeer(newsock, ws);
                    newsock.daddr = peer.addr;
                    newsock.dport = peer.port;
                    sock.pending.push(newsock);
                    SOCKFS.emit("connection", newsock.stream.fd)
                } else {
                    SOCKFS.websocket_sock_ops.createPeer(sock, ws);
                    SOCKFS.emit("connection", sock.stream.fd)
                }
            });
            sock.server.on("close", function() {
                SOCKFS.emit("close", sock.stream.fd);
                sock.server = null
            });
            sock.server.on("error", function(error) {
                sock.error = 23;
                SOCKFS.emit("error", [sock.stream.fd, sock.error, "EHOSTUNREACH: Host is unreachable"])
            })
        },
        accept(listensock) {
            if (!listensock.server || !listensock.pending.length) {
                throw new FS.ErrnoError(28)
            }
            var newsock = listensock.pending.shift();
            newsock.stream.flags = listensock.stream.flags;
            return newsock
        },
        getname(sock, peer) {
            var addr, port;
            if (peer) {
                if (sock.daddr === undefined || sock.dport === undefined) {
                    throw new FS.ErrnoError(53)
                }
                addr = sock.daddr;
                port = sock.dport
            } else {
                addr = sock.saddr || 0;
                port = sock.sport || 0
            }
            return {
                addr,
                port
            }
        },
        sendmsg(sock, buffer, offset, length, addr, port) {
            if (sock.type === 2) {
                if (addr === undefined || port === undefined) {
                    addr = sock.daddr;
                    port = sock.dport
                }
                if (addr === undefined || port === undefined) {
                    throw new FS.ErrnoError(17)
                }
            } else {
                addr = sock.daddr;
                port = sock.dport
            }
            var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);
            if (sock.type === 1) {
                if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                    throw new FS.ErrnoError(53)
                }
            }
            if (ArrayBuffer.isView(buffer)) {
                offset += buffer.byteOffset;
                buffer = buffer.buffer
            }
            var data = buffer.slice(offset, offset + length);
            if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
                if (sock.type === 2) {
                    if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                        dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port)
                    }
                }
                dest.msg_send_queue.push(data);
                return length
            }
            try {
                dest.socket.send(data);
                return length
            } catch (e) {
                throw new FS.ErrnoError(28)
            }
        },
        recvmsg(sock, length) {
            if (sock.type === 1 && sock.server) {
                throw new FS.ErrnoError(53)
            }
            var queued = sock.recv_queue.shift();
            if (!queued) {
                if (sock.type === 1) {
                    var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
                    if (!dest) {
                        throw new FS.ErrnoError(53)
                    }
                    if (dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                        return null
                    }
                    throw new FS.ErrnoError(6)
                }
                throw new FS.ErrnoError(6)
            }
            var queuedLength = queued.data.byteLength || queued.data.length;
            var queuedOffset = queued.data.byteOffset || 0;
            var queuedBuffer = queued.data.buffer || queued.data;
            var bytesRead = Math.min(length, queuedLength);
            var res = {
                buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead),
                addr: queued.addr,
                port: queued.port
            };
            if (sock.type === 1 && bytesRead < queuedLength) {
                var bytesRemaining = queuedLength - bytesRead;
                queued.data = new Uint8Array(queuedBuffer, queuedOffset + bytesRead, bytesRemaining);
                sock.recv_queue.unshift(queued)
            }
            return res
        }
    }
};
var getSocketFromFD = fd => {
    var socket = SOCKFS.getSocket(fd);
    if (!socket) throw new FS.ErrnoError(8);
    return socket
};
var inetPton4 = str => {
    var b = str.split(".");
    for (var i = 0; i < 4; i++) {
        var tmp = Number(b[i]);
        if (isNaN(tmp)) return null;
        b[i] = tmp
    }
    return (b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24) >>> 0
};
var inetPton6 = str => {
    var words;
    var w, offset, z;
    var valid6regx = /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i;
    var parts = [];
    if (!valid6regx.test(str)) {
        return null
    }
    if (str === "::") {
        return [0, 0, 0, 0, 0, 0, 0, 0]
    }
    if (str.startsWith("::")) {
        str = str.replace("::", "Z:")
    } else {
        str = str.replace("::", ":Z:")
    }
    if (str.indexOf(".") > 0) {
        str = str.replace(new RegExp("[.]", "g"), ":");
        words = str.split(":");
        words[words.length - 4] = Number(words[words.length - 4]) + Number(words[words.length - 3]) * 256;
        words[words.length - 3] = Number(words[words.length - 2]) + Number(words[words.length - 1]) * 256;
        words = words.slice(0, words.length - 2)
    } else {
        words = str.split(":")
    }
    offset = 0;
    z = 0;
    for (w = 0; w < words.length; w++) {
        if (typeof words[w] == "string") {
            if (words[w] === "Z") {
                for (z = 0; z < 8 - words.length + 1; z++) {
                    parts[w + z] = 0
                }
                offset = z - 1
            } else {
                parts[w + offset] = _htons(parseInt(words[w], 16))
            }
        } else {
            parts[w + offset] = words[w]
        }
    }
    return [parts[1] << 16 | parts[0], parts[3] << 16 | parts[2], parts[5] << 16 | parts[4], parts[7] << 16 | parts[6]]
};
var writeSockaddr = (sa, family, addr, port, addrlen) => {
    switch (family) {
        case 2:
            addr = inetPton4(addr);
            zeroMemory(sa, 16);
            if (addrlen) {
                HEAP32[addrlen >> 2] = 16
            }
            HEAP16[sa >> 1] = family;
            HEAP32[sa + 4 >> 2] = addr;
            HEAP16[sa + 2 >> 1] = _htons(port);
            break;
        case 10:
            addr = inetPton6(addr);
            zeroMemory(sa, 28);
            if (addrlen) {
                HEAP32[addrlen >> 2] = 28
            }
            HEAP32[sa >> 2] = family;
            HEAP32[sa + 8 >> 2] = addr[0];
            HEAP32[sa + 12 >> 2] = addr[1];
            HEAP32[sa + 16 >> 2] = addr[2];
            HEAP32[sa + 20 >> 2] = addr[3];
            HEAP16[sa + 2 >> 1] = _htons(port);
            break;
        default:
            return 5
    }
    return 0
};
var DNS = {
    address_map: {
        id: 1,
        addrs: {},
        names: {}
    },
    lookup_name(name) {
        var res = inetPton4(name);
        if (res !== null) {
            return name
        }
        res = inetPton6(name);
        if (res !== null) {
            return name
        }
        var addr;
        if (DNS.address_map.addrs[name]) {
            addr = DNS.address_map.addrs[name]
        } else {
            var id = DNS.address_map.id++;
            addr = "172.29." + (id & 255) + "." + (id & 65280);
            DNS.address_map.names[addr] = name;
            DNS.address_map.addrs[name] = addr
        }
        return addr
    },
    lookup_addr(addr) {
        if (DNS.address_map.names[addr]) {
            return DNS.address_map.names[addr]
        }
        return null
    }
};

function ___syscall_accept4(fd, addr, addrlen, flags, d1, d2) {
    try {
        var sock = getSocketFromFD(fd);
        var newsock = sock.sock_ops.accept(sock);
        if (addr) {
            var errno = writeSockaddr(addr, newsock.family, DNS.lookup_name(newsock.daddr), newsock.dport, addrlen)
        }
        return newsock.stream.fd
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}
var inetNtop4 = addr => (addr & 255) + "." + (addr >> 8 & 255) + "." + (addr >> 16 & 255) + "." + (addr >> 24 & 255);
var inetNtop6 = ints => {
    var str = "";
    var word = 0;
    var longest = 0;
    var lastzero = 0;
    var zstart = 0;
    var len = 0;
    var i = 0;
    var parts = [ints[0] & 65535, ints[0] >> 16, ints[1] & 65535, ints[1] >> 16, ints[2] & 65535, ints[2] >> 16, ints[3] & 65535, ints[3] >> 16];
    var hasipv4 = true;
    var v4part = "";
    for (i = 0; i < 5; i++) {
        if (parts[i] !== 0) {
            hasipv4 = false;
            break
        }
    }
    if (hasipv4) {
        v4part = inetNtop4(parts[6] | parts[7] << 16);
        if (parts[5] === -1) {
            str = "::ffff:";
            str += v4part;
            return str
        }
        if (parts[5] === 0) {
            str = "::";
            if (v4part === "0.0.0.0") v4part = "";
            if (v4part === "0.0.0.1") v4part = "1";
            str += v4part;
            return str
        }
    }
    for (word = 0; word < 8; word++) {
        if (parts[word] === 0) {
            if (word - lastzero > 1) {
                len = 0
            }
            lastzero = word;
            len++
        }
        if (len > longest) {
            longest = len;
            zstart = word - longest + 1
        }
    }
    for (word = 0; word < 8; word++) {
        if (longest > 1) {
            if (parts[word] === 0 && word >= zstart && word < zstart + longest) {
                if (word === zstart) {
                    str += ":";
                    if (zstart === 0) str += ":"
                }
                continue
            }
        }
        str += Number(_ntohs(parts[word] & 65535)).toString(16);
        str += word < 7 ? ":" : ""
    }
    return str
};
var readSockaddr = (sa, salen) => {
    var family = HEAP16[sa >> 1];
    var port = _ntohs(HEAPU16[sa + 2 >> 1]);
    var addr;
    switch (family) {
        case 2:
            if (salen !== 16) {
                return {
                    errno: 28
                }
            }
            addr = HEAP32[sa + 4 >> 2];
            addr = inetNtop4(addr);
            break;
        case 10:
            if (salen !== 28) {
                return {
                    errno: 28
                }
            }
            addr = [HEAP32[sa + 8 >> 2], HEAP32[sa + 12 >> 2], HEAP32[sa + 16 >> 2], HEAP32[sa + 20 >> 2]];
            addr = inetNtop6(addr);
            break;
        default:
            return {
                errno: 5
            }
    }
    return {
        family,
        addr,
        port
    }
};
var getSocketAddress = (addrp, addrlen) => {
    var info = readSockaddr(addrp, addrlen);
    if (info.errno) throw new FS.ErrnoError(info.errno);
    info.addr = DNS.lookup_addr(info.addr) || info.addr;
    return info
};

function ___syscall_bind(fd, addr, addrlen, d1, d2, d3) {
    try {
        var sock = getSocketFromFD(fd);
        var info = getSocketAddress(addr, addrlen);
        sock.sock_ops.bind(sock, info.addr, info.port);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_chmod(path, mode) {
    try {
        path = SYSCALLS.getStr(path);
        FS.chmod(path, mode);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_connect(fd, addr, addrlen, d1, d2, d3) {
    try {
        var sock = getSocketFromFD(fd);
        var info = getSocketAddress(addr, addrlen);
        sock.sock_ops.connect(sock, info.addr, info.port);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_faccessat(dirfd, path, amode, flags) {
    try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        if (amode & ~7) {
            return -28
        }
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        if (!node) {
            return -44
        }
        var perms = "";
        if (amode & 4) perms += "r";
        if (amode & 2) perms += "w";
        if (amode & 1) perms += "x";
        if (perms && FS.nodePermissions(node, perms)) {
            return -2
        }
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}
var syscallGetVarargI = () => {
    var ret = HEAP32[+SYSCALLS.varargs >> 2];
    SYSCALLS.varargs += 4;
    return ret
};
var syscallGetVarargP = syscallGetVarargI;

function ___syscall_fcntl64(fd, cmd, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        switch (cmd) {
            case 0: {
                var arg = syscallGetVarargI();
                if (arg < 0) {
                    return -28
                }
                while (FS.streams[arg]) {
                    arg++
                }
                var newStream;
                newStream = FS.dupStream(stream, arg);
                return newStream.fd
            }
            case 1:
            case 2:
                return 0;
            case 3:
                return stream.flags;
            case 4: {
                var arg = syscallGetVarargI();
                stream.flags |= arg;
                return 0
            }
            case 12: {
                var arg = syscallGetVarargP();
                var offset = 0;
                HEAP16[arg + offset >> 1] = 2;
                return 0
            }
            case 13:
            case 14:
                return 0
        }
        return -28
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_fstat64(fd, buf) {
    try {
        return SYSCALLS.writeStat(buf, FS.fstat(fd))
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_ftruncate64(fd, length) {
    length = bigintToI53Checked(length);
    try {
        if (isNaN(length)) return -61;
        FS.ftruncate(fd, length);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}
var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);

function ___syscall_getdents64(fd, dirp, count) {
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        stream.getdents ||= FS.readdir(stream.path);
        var struct_size = 280;
        var pos = 0;
        var off = FS.llseek(stream, 0, 1);
        var startIdx = Math.floor(off / struct_size);
        var endIdx = Math.min(stream.getdents.length, startIdx + Math.floor(count / struct_size));
        for (var idx = startIdx; idx < endIdx; idx++) {
            var id;
            var type;
            var name = stream.getdents[idx];
            if (name === ".") {
                id = stream.node.id;
                type = 4
            } else if (name === "..") {
                var lookup = FS.lookupPath(stream.path, {
                    parent: true
                });
                id = lookup.node.id;
                type = 4
            } else {
                var child;
                try {
                    child = FS.lookupNode(stream.node, name)
                } catch (e) {
                    if (e?.errno === 28) {
                        continue
                    }
                    throw e
                }
                id = child.id;
                type = FS.isChrdev(child.mode) ? 2 : FS.isDir(child.mode) ? 4 : FS.isLink(child.mode) ? 10 : 8
            }
            HEAP64[dirp + pos >> 3] = BigInt(id);
            HEAP64[dirp + pos + 8 >> 3] = BigInt((idx + 1) * struct_size);
            HEAP16[dirp + pos + 16 >> 1] = 280;
            HEAP8[dirp + pos + 18] = type;
            stringToUTF8(name, dirp + pos + 19, 256);
            pos += struct_size
        }
        FS.llseek(stream, idx * struct_size, 0);
        return pos
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_ioctl(fd, op, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        switch (op) {
            case 21509: {
                if (!stream.tty) return -59;
                return 0
            }
            case 21505: {
                if (!stream.tty) return -59;
                if (stream.tty.ops.ioctl_tcgets) {
                    var termios = stream.tty.ops.ioctl_tcgets(stream);
                    var argp = syscallGetVarargP();
                    HEAP32[argp >> 2] = termios.c_iflag || 0;
                    HEAP32[argp + 4 >> 2] = termios.c_oflag || 0;
                    HEAP32[argp + 8 >> 2] = termios.c_cflag || 0;
                    HEAP32[argp + 12 >> 2] = termios.c_lflag || 0;
                    for (var i = 0; i < 32; i++) {
                        HEAP8[argp + i + 17] = termios.c_cc[i] || 0
                    }
                    return 0
                }
                return 0
            }
            case 21510:
            case 21511:
            case 21512: {
                if (!stream.tty) return -59;
                return 0
            }
            case 21506:
            case 21507:
            case 21508: {
                if (!stream.tty) return -59;
                if (stream.tty.ops.ioctl_tcsets) {
                    var argp = syscallGetVarargP();
                    var c_iflag = HEAP32[argp >> 2];
                    var c_oflag = HEAP32[argp + 4 >> 2];
                    var c_cflag = HEAP32[argp + 8 >> 2];
                    var c_lflag = HEAP32[argp + 12 >> 2];
                    var c_cc = [];
                    for (var i = 0; i < 32; i++) {
                        c_cc.push(HEAP8[argp + i + 17])
                    }
                    return stream.tty.ops.ioctl_tcsets(stream.tty, op, {
                        c_iflag,
                        c_oflag,
                        c_cflag,
                        c_lflag,
                        c_cc
                    })
                }
                return 0
            }
            case 21519: {
                if (!stream.tty) return -59;
                var argp = syscallGetVarargP();
                HEAP32[argp >> 2] = 0;
                return 0
            }
            case 21520: {
                if (!stream.tty) return -59;
                return -28
            }
            case 21537:
            case 21531: {
                var argp = syscallGetVarargP();
                return FS.ioctl(stream, op, argp)
            }
            case 21523: {
                if (!stream.tty) return -59;
                if (stream.tty.ops.ioctl_tiocgwinsz) {
                    var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
                    var argp = syscallGetVarargP();
                    HEAP16[argp >> 1] = winsize[0];
                    HEAP16[argp + 2 >> 1] = winsize[1]
                }
                return 0
            }
            case 21524: {
                if (!stream.tty) return -59;
                return 0
            }
            case 21515: {
                if (!stream.tty) return -59;
                return 0
            }
            default:
                return -28
        }
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_listen(fd, backlog) {
    try {
        var sock = getSocketFromFD(fd);
        sock.sock_ops.listen(sock, backlog);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_lstat64(path, buf) {
    try {
        path = SYSCALLS.getStr(path);
        return SYSCALLS.writeStat(buf, FS.lstat(path))
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_mkdirat(dirfd, path, mode) {
    try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        FS.mkdir(path, mode, 0);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_newfstatat(dirfd, path, buf, flags) {
    try {
        path = SYSCALLS.getStr(path);
        var nofollow = flags & 256;
        var allowEmpty = flags & 4096;
        flags = flags & ~6400;
        path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
        return SYSCALLS.writeStat(buf, nofollow ? FS.lstat(path) : FS.stat(path))
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_openat(dirfd, path, flags, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        var mode = varargs ? syscallGetVarargI() : 0;
        return FS.open(path, flags, mode).fd
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_poll(fds, nfds, timeout) {
    try {
        var nonzero = 0;
        for (var i = 0; i < nfds; i++) {
            var pollfd = fds + 8 * i;
            var fd = HEAP32[pollfd >> 2];
            var events = HEAP16[pollfd + 4 >> 1];
            var mask = 32;
            var stream = FS.getStream(fd);
            if (stream) {
                mask = SYSCALLS.DEFAULT_POLLMASK;
                if (stream.stream_ops.poll) {
                    mask = stream.stream_ops.poll(stream, -1)
                }
            }
            mask &= events | 8 | 16;
            if (mask) nonzero++;
            HEAP16[pollfd + 6 >> 1] = mask
        }
        return nonzero
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_recvfrom(fd, buf, len, flags, addr, addrlen) {
    try {
        var sock = getSocketFromFD(fd);
        var msg = sock.sock_ops.recvmsg(sock, len);
        if (!msg) return 0;
        if (addr) {
            var errno = writeSockaddr(addr, sock.family, DNS.lookup_name(msg.addr), msg.port, addrlen)
        }
        HEAPU8.set(msg.buffer, buf);
        return msg.buffer.byteLength
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_renameat(olddirfd, oldpath, newdirfd, newpath) {
    try {
        oldpath = SYSCALLS.getStr(oldpath);
        newpath = SYSCALLS.getStr(newpath);
        oldpath = SYSCALLS.calculateAt(olddirfd, oldpath);
        newpath = SYSCALLS.calculateAt(newdirfd, newpath);
        FS.rename(oldpath, newpath);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_rmdir(path) {
    try {
        path = SYSCALLS.getStr(path);
        FS.rmdir(path);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_sendto(fd, message, length, flags, addr, addr_len) {
    try {
        var sock = getSocketFromFD(fd);
        if (!addr) {
            return FS.write(sock.stream, HEAP8, message, length)
        }
        var dest = getSocketAddress(addr, addr_len);
        return sock.sock_ops.sendmsg(sock, HEAP8, message, length, dest.addr, dest.port)
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_socket(domain, type, protocol) {
    try {
        var sock = SOCKFS.createSocket(domain, type, protocol);
        return sock.stream.fd
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_stat64(path, buf) {
    try {
        path = SYSCALLS.getStr(path);
        return SYSCALLS.writeStat(buf, FS.stat(path))
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_truncate64(path, length) {
    length = bigintToI53Checked(length);
    try {
        if (isNaN(length)) return -61;
        path = SYSCALLS.getStr(path);
        FS.truncate(path, length);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function ___syscall_unlinkat(dirfd, path, flags) {
    try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        if (!flags) {
            FS.unlink(path)
        } else if (flags === 512) {
            FS.rmdir(path)
        } else {
            return -28
        }
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}
var __abort_js = () => abort("");
var __emscripten_fs_load_embedded_files = ptr => {
    do {
        var name_addr = HEAPU32[ptr >> 2];
        ptr += 4;
        var len = HEAPU32[ptr >> 2];
        ptr += 4;
        var content = HEAPU32[ptr >> 2];
        ptr += 4;
        var name = UTF8ToString(name_addr);
        FS.createPath("/", PATH.dirname(name), true, true);
        FS.createDataFile(name, null, HEAP8.subarray(content, content + len), true, true, true)
    } while (HEAPU32[ptr >> 2])
};
var getExecutableName = () => thisProgram || "./this.program";
var __emscripten_get_progname = (str, len) => stringToUTF8(getExecutableName(), str, len);
var __emscripten_lookup_name = name => {
    var nameString = UTF8ToString(name);
    return inetPton4(DNS.lookup_name(nameString))
};
var __emscripten_throw_longjmp = () => {
    throw Infinity
};

function __gmtime_js(time, tmPtr) {
    time = bigintToI53Checked(time);
    var date = new Date(time * 1e3);
    HEAP32[tmPtr >> 2] = date.getUTCSeconds();
    HEAP32[tmPtr + 4 >> 2] = date.getUTCMinutes();
    HEAP32[tmPtr + 8 >> 2] = date.getUTCHours();
    HEAP32[tmPtr + 12 >> 2] = date.getUTCDate();
    HEAP32[tmPtr + 16 >> 2] = date.getUTCMonth();
    HEAP32[tmPtr + 20 >> 2] = date.getUTCFullYear() - 1900;
    HEAP32[tmPtr + 24 >> 2] = date.getUTCDay();
    var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    var yday = (date.getTime() - start) / (1e3 * 60 * 60 * 24) | 0;
    HEAP32[tmPtr + 28 >> 2] = yday
}
var isLeapYear = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
var MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
var MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
var ydayFromDate = date => {
    var leap = isLeapYear(date.getFullYear());
    var monthDaysCumulative = leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE;
    var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
    return yday
};

function __localtime_js(time, tmPtr) {
    time = bigintToI53Checked(time);
    var date = new Date(time * 1e3);
    HEAP32[tmPtr >> 2] = date.getSeconds();
    HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
    HEAP32[tmPtr + 8 >> 2] = date.getHours();
    HEAP32[tmPtr + 12 >> 2] = date.getDate();
    HEAP32[tmPtr + 16 >> 2] = date.getMonth();
    HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
    HEAP32[tmPtr + 24 >> 2] = date.getDay();
    var yday = ydayFromDate(date) | 0;
    HEAP32[tmPtr + 28 >> 2] = yday;
    HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
    var start = new Date(date.getFullYear(), 0, 1);
    var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
    HEAP32[tmPtr + 32 >> 2] = dst
}
var __mktime_js = function(tmPtr) {
    var ret = (() => {
        var date = new Date(HEAP32[tmPtr + 20 >> 2] + 1900, HEAP32[tmPtr + 16 >> 2], HEAP32[tmPtr + 12 >> 2], HEAP32[tmPtr + 8 >> 2], HEAP32[tmPtr + 4 >> 2], HEAP32[tmPtr >> 2], 0);
        var dst = HEAP32[tmPtr + 32 >> 2];
        var guessedOffset = date.getTimezoneOffset();
        var start = new Date(date.getFullYear(), 0, 1);
        var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
        var winterOffset = start.getTimezoneOffset();
        var dstOffset = Math.min(winterOffset, summerOffset);
        if (dst < 0) {
            HEAP32[tmPtr + 32 >> 2] = Number(summerOffset != winterOffset && dstOffset == guessedOffset)
        } else if (dst > 0 != (dstOffset == guessedOffset)) {
            var nonDstOffset = Math.max(winterOffset, summerOffset);
            var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
            date.setTime(date.getTime() + (trueOffset - guessedOffset) * 6e4)
        }
        HEAP32[tmPtr + 24 >> 2] = date.getDay();
        var yday = ydayFromDate(date) | 0;
        HEAP32[tmPtr + 28 >> 2] = yday;
        HEAP32[tmPtr >> 2] = date.getSeconds();
        HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
        HEAP32[tmPtr + 8 >> 2] = date.getHours();
        HEAP32[tmPtr + 12 >> 2] = date.getDate();
        HEAP32[tmPtr + 16 >> 2] = date.getMonth();
        HEAP32[tmPtr + 20 >> 2] = date.getYear();
        var timeMs = date.getTime();
        if (isNaN(timeMs)) {
            return -1
        }
        return timeMs / 1e3
    })();
    return BigInt(ret)
};

function __mmap_js(len, prot, flags, fd, offset, allocated, addr) {
    offset = bigintToI53Checked(offset);
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var res = FS.mmap(stream, len, offset, prot, flags);
        var ptr = res.ptr;
        HEAP32[allocated >> 2] = res.allocated;
        HEAPU32[addr >> 2] = ptr;
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function __msync_js(addr, len, prot, flags, fd, offset) {
    offset = bigintToI53Checked(offset);
    try {
        if (isNaN(offset)) return -61;
        SYSCALLS.doMsync(addr, SYSCALLS.getStreamFromFD(fd), len, flags, offset);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}

function __munmap_js(addr, len, prot, flags, fd, offset) {
    offset = bigintToI53Checked(offset);
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        if (prot & 2) {
            SYSCALLS.doMsync(addr, stream, len, flags, offset)
        }
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno
    }
}
var __timegm_js = function(tmPtr) {
    var ret = (() => {
        var time = Date.UTC(HEAP32[tmPtr + 20 >> 2] + 1900, HEAP32[tmPtr + 16 >> 2], HEAP32[tmPtr + 12 >> 2], HEAP32[tmPtr + 8 >> 2], HEAP32[tmPtr + 4 >> 2], HEAP32[tmPtr >> 2], 0);
        var date = new Date(time);
        HEAP32[tmPtr + 24 >> 2] = date.getUTCDay();
        var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
        var yday = (date.getTime() - start) / (1e3 * 60 * 60 * 24) | 0;
        HEAP32[tmPtr + 28 >> 2] = yday;
        return date.getTime() / 1e3
    })();
    return BigInt(ret)
};
var __tzset_js = (timezone, daylight, std_name, dst_name) => {
    var currentYear = (new Date).getFullYear();
    var winter = new Date(currentYear, 0, 1);
    var summer = new Date(currentYear, 6, 1);
    var winterOffset = winter.getTimezoneOffset();
    var summerOffset = summer.getTimezoneOffset();
    var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
    HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
    HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
    var extractZone = timezoneOffset => {
        var sign = timezoneOffset >= 0 ? "-" : "+";
        var absOffset = Math.abs(timezoneOffset);
        var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
        var minutes = String(absOffset % 60).padStart(2, "0");
        return `UTC${sign}${hours}${minutes}`
    };
    var winterName = extractZone(winterOffset);
    var summerName = extractZone(summerOffset);
    if (summerOffset < winterOffset) {
        stringToUTF8(winterName, std_name, 17);
        stringToUTF8(summerName, dst_name, 17)
    } else {
        stringToUTF8(winterName, dst_name, 17);
        stringToUTF8(summerName, std_name, 17)
    }
};
var _emscripten_get_now = () => performance.now();
var _emscripten_date_now = () => Date.now();
var nowIsMonotonic = 1;
var checkWasiClock = clock_id => clock_id >= 0 && clock_id <= 3;

function _clock_time_get(clk_id, ignored_precision, ptime) {
    ignored_precision = bigintToI53Checked(ignored_precision);
    if (!checkWasiClock(clk_id)) {
        return 28
    }
    var now;
    if (clk_id === 0) {
        now = _emscripten_date_now()
    } else if (nowIsMonotonic) {
        now = _emscripten_get_now()
    } else {
        return 52
    }
    var nsec = Math.round(now * 1e3 * 1e3);
    HEAP64[ptime >> 3] = BigInt(nsec);
    return 0
}
var handleException = e => {
    if (e instanceof ExitStatus || e == "unwind") {
        return EXITSTATUS
    }
    quit_(1, e)
};
var runtimeKeepaliveCounter = 0;
var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
var _proc_exit = code => {
    EXITSTATUS = code;
    if (!keepRuntimeAlive()) {
        Module["onExit"]?.(code);
        ABORT = true
    }
    quit_(code, new ExitStatus(code))
};
var exitJS = (status, implicit) => {
    EXITSTATUS = status;
    _proc_exit(status)
};
var _exit = exitJS;
var maybeExit = () => {
    if (!keepRuntimeAlive()) {
        try {
            _exit(EXITSTATUS)
        } catch (e) {
            handleException(e)
        }
    }
};
var callUserCallback = func => {
    if (ABORT) {
        return
    }
    try {
        func();
        maybeExit()
    } catch (e) {
        handleException(e)
    }
};

function getFullscreenElement() {
    return document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || document.msFullscreenElement
}
var safeSetTimeout = (func, timeout) => setTimeout(() => {
    callUserCallback(func)
}, timeout);
var warnOnce = text => {
    warnOnce.shown ||= {};
    if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = "warning: " + text;
        err(text)
    }
};
var Browser = {
    useWebGL: false,
    isFullscreen: false,
    pointerLock: false,
    moduleContextCreatedCallbacks: [],
    workers: [],
    preloadedImages: {},
    preloadedAudios: {},
    getCanvas: () => Module["canvas"],
    init() {
        if (Browser.initted) return;
        Browser.initted = true;
        var imagePlugin = {};
        imagePlugin["canHandle"] = function imagePlugin_canHandle(name) {
            return !Module["noImageDecoding"] && /\.(jpg|jpeg|png|bmp|webp)$/i.test(name)
        };
        imagePlugin["handle"] = async function imagePlugin_handle(byteArray, name) {
            var b = new Blob([byteArray], {
                type: Browser.getMimetype(name)
            });
            if (b.size !== byteArray.length) {
                b = new Blob([new Uint8Array(byteArray).buffer], {
                    type: Browser.getMimetype(name)
                })
            }
            var url = URL.createObjectURL(b);
            return new Promise((resolve, reject) => {
                var img = new Image;
                img.onload = () => {
                    var canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    var ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    Browser.preloadedImages[name] = canvas;
                    URL.revokeObjectURL(url);
                    resolve(byteArray)
                };
                img.onerror = event => {
                    err(`Image ${url} could not be decoded`);
                    reject()
                };
                img.src = url
            })
        };
        preloadPlugins.push(imagePlugin);
        var audioPlugin = {};
        audioPlugin["canHandle"] = function audioPlugin_canHandle(name) {
            return !Module["noAudioDecoding"] && name.slice(-4) in {
                ".ogg": 1,
                ".wav": 1,
                ".mp3": 1
            }
        };
        audioPlugin["handle"] = async function audioPlugin_handle(byteArray, name) {
            return new Promise((resolve, reject) => {
                var done = false;

                function finish(audio) {
                    if (done) return;
                    done = true;
                    Browser.preloadedAudios[name] = audio;
                    resolve(byteArray)
                }
                var b = new Blob([byteArray], {
                    type: Browser.getMimetype(name)
                });
                var url = URL.createObjectURL(b);
                var audio = new Audio;
                audio.addEventListener("canplaythrough", () => finish(audio), false);
                audio.onerror = function audio_onerror(event) {
                    if (done) return;
                    err(`warning: browser could not fully decode audio ${name}, trying slower base64 approach`);

                    function encode64(data) {
                        var BASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                        var PAD = "=";
                        var ret = "";
                        var leftchar = 0;
                        var leftbits = 0;
                        for (var i = 0; i < data.length; i++) {
                            leftchar = leftchar << 8 | data[i];
                            leftbits += 8;
                            while (leftbits >= 6) {
                                var curr = leftchar >> leftbits - 6 & 63;
                                leftbits -= 6;
                                ret += BASE[curr]
                            }
                        }
                        if (leftbits == 2) {
                            ret += BASE[(leftchar & 3) << 4];
                            ret += PAD + PAD
                        } else if (leftbits == 4) {
                            ret += BASE[(leftchar & 15) << 2];
                            ret += PAD
                        }
                        return ret
                    }
                    audio.src = "data:audio/x-" + name.slice(-3) + ";base64," + encode64(byteArray);
                    finish(audio)
                };
                audio.src = url;
                safeSetTimeout(() => {
                    finish(audio)
                }, 1e4)
            })
        };
        preloadPlugins.push(audioPlugin);

        function pointerLockChange() {
            var canvas = Browser.getCanvas();
            Browser.pointerLock = document.pointerLockElement === canvas
        }
        var canvas = Browser.getCanvas();
        if (canvas) {
            document.addEventListener("pointerlockchange", pointerLockChange, false);
            if (Module["elementPointerLock"]) {
                canvas.addEventListener("click", ev => {
                    if (!Browser.pointerLock && Browser.getCanvas().requestPointerLock) {
                        Browser.getCanvas().requestPointerLock();
                        ev.preventDefault()
                    }
                }, false)
            }
        }
    },
    createContext(canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module["ctx"] && canvas == Browser.getCanvas()) return Module["ctx"];
        var ctx;
        var contextHandle;
        if (useWebGL) {
            var contextAttributes = {
                antialias: false,
                alpha: false,
                majorVersion: 1
            };
            if (webGLContextAttributes) {
                for (var attribute in webGLContextAttributes) {
                    contextAttributes[attribute] = webGLContextAttributes[attribute]
                }
            }
            if (typeof GL != "undefined") {
                contextHandle = GL.createContext(canvas, contextAttributes);
                if (contextHandle) {
                    ctx = GL.getContext(contextHandle).GLctx
                }
            }
        } else {
            ctx = canvas.getContext("2d")
        }
        if (!ctx) return null;
        if (setInModule) {
            Module["ctx"] = ctx;
            if (useWebGL) GL.makeContextCurrent(contextHandle);
            Browser.useWebGL = useWebGL;
            Browser.moduleContextCreatedCallbacks.forEach(callback => callback());
            Browser.init()
        }
        return ctx
    },
    fullscreenHandlersInstalled: false,
    lockPointer: undefined,
    resizeCanvas: undefined,
    requestFullscreen(lockPointer, resizeCanvas) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        if (typeof Browser.lockPointer == "undefined") Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas == "undefined") Browser.resizeCanvas = false;
        var canvas = Browser.getCanvas();

        function fullscreenChange() {
            Browser.isFullscreen = false;
            var canvasContainer = canvas.parentNode;
            if (getFullscreenElement() === canvasContainer) {
                canvas.exitFullscreen = Browser.exitFullscreen;
                if (Browser.lockPointer) canvas.requestPointerLock();
                Browser.isFullscreen = true;
                if (Browser.resizeCanvas) {
                    Browser.setFullscreenCanvasSize()
                } else {
                    Browser.updateCanvasDimensions(canvas)
                }
            } else {
                canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
                canvasContainer.parentNode.removeChild(canvasContainer);
                if (Browser.resizeCanvas) {
                    Browser.setWindowedCanvasSize()
                } else {
                    Browser.updateCanvasDimensions(canvas)
                }
            }
            Module["onFullScreen"]?.(Browser.isFullscreen);
            Module["onFullscreen"]?.(Browser.isFullscreen)
        }
        if (!Browser.fullscreenHandlersInstalled) {
            Browser.fullscreenHandlersInstalled = true;
            document.addEventListener("fullscreenchange", fullscreenChange, false);
            document.addEventListener("mozfullscreenchange", fullscreenChange, false);
            document.addEventListener("webkitfullscreenchange", fullscreenChange, false);
            document.addEventListener("MSFullscreenChange", fullscreenChange, false)
        }
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
        canvasContainer.requestFullscreen = canvasContainer["requestFullscreen"] || canvasContainer["mozRequestFullScreen"] || canvasContainer["msRequestFullscreen"] || (canvasContainer["webkitRequestFullscreen"] ? () => canvasContainer["webkitRequestFullscreen"](Element["ALLOW_KEYBOARD_INPUT"]) : null) || (canvasContainer["webkitRequestFullScreen"] ? () => canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"]) : null);
        canvasContainer.requestFullscreen()
    },
    exitFullscreen() {
        if (!Browser.isFullscreen) {
            return false
        }
        var CFS = document["exitFullscreen"] || document["cancelFullScreen"] || document["mozCancelFullScreen"] || document["msExitFullscreen"] || document["webkitCancelFullScreen"] || (() => {});
        CFS.apply(document, []);
        return true
    },
    safeSetTimeout(func, timeout) {
        return safeSetTimeout(func, timeout)
    },
    getMimetype(name) {
        return {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            bmp: "image/bmp",
            ogg: "audio/ogg",
            wav: "audio/wav",
            mp3: "audio/mpeg"
        } [name.slice(name.lastIndexOf(".") + 1)]
    },
    getUserMedia(func) {
        window.getUserMedia ||= navigator["getUserMedia"] || navigator["mozGetUserMedia"];
        window.getUserMedia(func)
    },
    getMovementX(event) {
        return event["movementX"] || event["mozMovementX"] || event["webkitMovementX"] || 0
    },
    getMovementY(event) {
        return event["movementY"] || event["mozMovementY"] || event["webkitMovementY"] || 0
    },
    getMouseWheelDelta(event) {
        var delta = 0;
        switch (event.type) {
            case "DOMMouseScroll":
                delta = event.detail / 3;
                break;
            case "mousewheel":
                delta = event.wheelDelta / 120;
                break;
            case "wheel":
                delta = event.deltaY;
                switch (event.deltaMode) {
                    case 0:
                        delta /= 100;
                        break;
                    case 1:
                        delta /= 3;
                        break;
                    case 2:
                        delta *= 80;
                        break;
                    default:
                        abort("unrecognized mouse wheel delta mode: " + event.deltaMode)
                }
                break;
            default:
                abort("unrecognized mouse wheel event: " + event.type)
        }
        return delta
    },
    mouseX: 0,
    mouseY: 0,
    mouseMovementX: 0,
    mouseMovementY: 0,
    touches: {},
    lastTouches: {},
    calculateMouseCoords(pageX, pageY) {
        var canvas = Browser.getCanvas();
        var rect = canvas.getBoundingClientRect();
        var scrollX = typeof window.scrollX != "undefined" ? window.scrollX : window.pageXOffset;
        var scrollY = typeof window.scrollY != "undefined" ? window.scrollY : window.pageYOffset;
        var adjustedX = pageX - (scrollX + rect.left);
        var adjustedY = pageY - (scrollY + rect.top);
        adjustedX = adjustedX * (canvas.width / rect.width);
        adjustedY = adjustedY * (canvas.height / rect.height);
        return {
            x: adjustedX,
            y: adjustedY
        }
    },
    setMouseCoords(pageX, pageY) {
        const {
            x,
            y
        } = Browser.calculateMouseCoords(pageX, pageY);
        Browser.mouseMovementX = x - Browser.mouseX;
        Browser.mouseMovementY = y - Browser.mouseY;
        Browser.mouseX = x;
        Browser.mouseY = y
    },
    calculateMouseEvent(event) {
        if (Browser.pointerLock) {
            if (event.type != "mousemove" && "mozMovementX" in event) {
                Browser.mouseMovementX = Browser.mouseMovementY = 0
            } else {
                Browser.mouseMovementX = Browser.getMovementX(event);
                Browser.mouseMovementY = Browser.getMovementY(event)
            }
            Browser.mouseX += Browser.mouseMovementX;
            Browser.mouseY += Browser.mouseMovementY
        } else {
            if (event.type === "touchstart" || event.type === "touchend" || event.type === "touchmove") {
                var touch = event.touch;
                if (touch === undefined) {
                    return
                }
                var coords = Browser.calculateMouseCoords(touch.pageX, touch.pageY);
                if (event.type === "touchstart") {
                    Browser.lastTouches[touch.identifier] = coords;
                    Browser.touches[touch.identifier] = coords
                } else if (event.type === "touchend" || event.type === "touchmove") {
                    var last = Browser.touches[touch.identifier];
                    last ||= coords;
                    Browser.lastTouches[touch.identifier] = last;
                    Browser.touches[touch.identifier] = coords
                }
                return
            }
            Browser.setMouseCoords(event.pageX, event.pageY)
        }
    },
    resizeListeners: [],
    updateResizeListeners() {
        var canvas = Browser.getCanvas();
        Browser.resizeListeners.forEach(listener => listener(canvas.width, canvas.height))
    },
    setCanvasSize(width, height, noUpdates) {
        var canvas = Browser.getCanvas();
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners()
    },
    windowedWidth: 0,
    windowedHeight: 0,
    setFullscreenCanvasSize() {
        if (typeof SDL != "undefined") {
            var flags = HEAPU32[SDL.screen >> 2];
            flags = flags | 8388608;
            HEAP32[SDL.screen >> 2] = flags
        }
        Browser.updateCanvasDimensions(Browser.getCanvas());
        Browser.updateResizeListeners()
    },
    setWindowedCanvasSize() {
        if (typeof SDL != "undefined") {
            var flags = HEAPU32[SDL.screen >> 2];
            flags = flags & ~8388608;
            HEAP32[SDL.screen >> 2] = flags
        }
        Browser.updateCanvasDimensions(Browser.getCanvas());
        Browser.updateResizeListeners()
    },
    updateCanvasDimensions(canvas, wNative, hNative) {
        if (wNative && hNative) {
            canvas.widthNative = wNative;
            canvas.heightNative = hNative
        } else {
            wNative = canvas.widthNative;
            hNative = canvas.heightNative
        }
        var w = wNative;
        var h = hNative;
        if (Module["forcedAspectRatio"] > 0) {
            if (w / h < Module["forcedAspectRatio"]) {
                w = Math.round(h * Module["forcedAspectRatio"])
            } else {
                h = Math.round(w / Module["forcedAspectRatio"])
            }
        }
        if (getFullscreenElement() === canvas.parentNode && typeof screen != "undefined") {
            var factor = Math.min(screen.width / w, screen.height / h);
            w = Math.round(w * factor);
            h = Math.round(h * factor)
        }
        if (Browser.resizeCanvas) {
            if (canvas.width != w) canvas.width = w;
            if (canvas.height != h) canvas.height = h;
            if (typeof canvas.style != "undefined") {
                canvas.style.removeProperty("width");
                canvas.style.removeProperty("height")
            }
        } else {
            if (canvas.width != wNative) canvas.width = wNative;
            if (canvas.height != hNative) canvas.height = hNative;
            if (typeof canvas.style != "undefined") {
                if (w != wNative || h != hNative) {
                    canvas.style.setProperty("width", w + "px", "important");
                    canvas.style.setProperty("height", h + "px", "important")
                } else {
                    canvas.style.removeProperty("width");
                    canvas.style.removeProperty("height")
                }
            }
        }
    }
};
var EGL = {
    errorCode: 12288,
    defaultDisplayInitialized: false,
    currentContext: 0,
    currentReadSurface: 0,
    currentDrawSurface: 0,
    contextAttributes: {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false
    },
    stringCache: {},
    setErrorCode(code) {
        EGL.errorCode = code
    },
    chooseConfig(display, attribList, config, config_size, numConfigs) {
        if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0
        }
        if (attribList) {
            for (;;) {
                var param = HEAP32[attribList >> 2];
                if (param == 12321) {
                    var alphaSize = HEAP32[attribList + 4 >> 2];
                    EGL.contextAttributes.alpha = alphaSize > 0
                } else if (param == 12325) {
                    var depthSize = HEAP32[attribList + 4 >> 2];
                    EGL.contextAttributes.depth = depthSize > 0
                } else if (param == 12326) {
                    var stencilSize = HEAP32[attribList + 4 >> 2];
                    EGL.contextAttributes.stencil = stencilSize > 0
                } else if (param == 12337) {
                    var samples = HEAP32[attribList + 4 >> 2];
                    EGL.contextAttributes.antialias = samples > 0
                } else if (param == 12338) {
                    var samples = HEAP32[attribList + 4 >> 2];
                    EGL.contextAttributes.antialias = samples == 1
                } else if (param == 12544) {
                    var requestedPriority = HEAP32[attribList + 4 >> 2];
                    EGL.contextAttributes.lowLatency = requestedPriority != 12547
                } else if (param == 12344) {
                    break
                }
                attribList += 8
            }
        }
        if ((!config || !config_size) && !numConfigs) {
            EGL.setErrorCode(12300);
            return 0
        }
        if (numConfigs) {
            HEAP32[numConfigs >> 2] = 1
        }
        if (config && config_size > 0) {
            HEAPU32[config >> 2] = 62002
        }
        EGL.setErrorCode(12288);
        return 1
    }
};
var _eglBindAPI = api => {
    if (api == 12448) {
        EGL.setErrorCode(12288);
        return 1
    }
    EGL.setErrorCode(12300);
    return 0
};
var _eglChooseConfig = (display, attrib_list, configs, config_size, numConfigs) => EGL.chooseConfig(display, attrib_list, configs, config_size, numConfigs);
var GLctx;
var webgl_enable_ANGLE_instanced_arrays = ctx => {
    var ext = ctx.getExtension("ANGLE_instanced_arrays");
    if (ext) {
        ctx["vertexAttribDivisor"] = (index, divisor) => ext["vertexAttribDivisorANGLE"](index, divisor);
        ctx["drawArraysInstanced"] = (mode, first, count, primcount) => ext["drawArraysInstancedANGLE"](mode, first, count, primcount);
        ctx["drawElementsInstanced"] = (mode, count, type, indices, primcount) => ext["drawElementsInstancedANGLE"](mode, count, type, indices, primcount);
        return 1
    }
};
var webgl_enable_OES_vertex_array_object = ctx => {
    var ext = ctx.getExtension("OES_vertex_array_object");
    if (ext) {
        ctx["createVertexArray"] = () => ext["createVertexArrayOES"]();
        ctx["deleteVertexArray"] = vao => ext["deleteVertexArrayOES"](vao);
        ctx["bindVertexArray"] = vao => ext["bindVertexArrayOES"](vao);
        ctx["isVertexArray"] = vao => ext["isVertexArrayOES"](vao);
        return 1
    }
};
var webgl_enable_WEBGL_draw_buffers = ctx => {
    var ext = ctx.getExtension("WEBGL_draw_buffers");
    if (ext) {
        ctx["drawBuffers"] = (n, bufs) => ext["drawBuffersWEBGL"](n, bufs);
        return 1
    }
};
var webgl_enable_EXT_polygon_offset_clamp = ctx => !!(ctx.extPolygonOffsetClamp = ctx.getExtension("EXT_polygon_offset_clamp"));
var webgl_enable_EXT_clip_control = ctx => !!(ctx.extClipControl = ctx.getExtension("EXT_clip_control"));
var webgl_enable_WEBGL_polygon_mode = ctx => !!(ctx.webglPolygonMode = ctx.getExtension("WEBGL_polygon_mode"));
var webgl_enable_WEBGL_multi_draw = ctx => !!(ctx.multiDrawWebgl = ctx.getExtension("WEBGL_multi_draw"));
var getEmscriptenSupportedExtensions = ctx => {
    var supportedExtensions = ["ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_disjoint_timer_query", "EXT_frag_depth", "EXT_shader_texture_lod", "EXT_sRGB", "OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives", "OES_texture_float", "OES_texture_half_float", "OES_texture_half_float_linear", "OES_vertex_array_object", "WEBGL_color_buffer_float", "WEBGL_depth_texture", "WEBGL_draw_buffers", "EXT_clip_control", "EXT_color_buffer_half_float", "EXT_depth_clamp", "EXT_float_blend", "EXT_polygon_offset_clamp", "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc", "EXT_texture_filter_anisotropic", "KHR_parallel_shader_compile", "OES_texture_float_linear", "WEBGL_blend_func_extended", "WEBGL_compressed_texture_astc", "WEBGL_compressed_texture_etc", "WEBGL_compressed_texture_etc1", "WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_lose_context", "WEBGL_multi_draw", "WEBGL_polygon_mode"];
    return (ctx.getSupportedExtensions() || []).filter(ext => supportedExtensions.includes(ext))
};
var GL = {
    counter: 1,
    buffers: [],
    programs: [],
    framebuffers: [],
    renderbuffers: [],
    textures: [],
    shaders: [],
    vaos: [],
    contexts: [],
    offscreenCanvases: {},
    queries: [],
    stringCache: {},
    unpackAlignment: 4,
    unpackRowLength: 0,
    recordError: errorCode => {
        if (!GL.lastError) {
            GL.lastError = errorCode
        }
    },
    getNewId: table => {
        var ret = GL.counter++;
        for (var i = table.length; i < ret; i++) {
            table[i] = null
        }
        return ret
    },
    genObject: (n, buffers, createFunction, objectTable) => {
        for (var i = 0; i < n; i++) {
            var buffer = GLctx[createFunction]();
            var id = buffer && GL.getNewId(objectTable);
            if (buffer) {
                buffer.name = id;
                objectTable[id] = buffer
            } else {
                GL.recordError(1282)
            }
            HEAP32[buffers + i * 4 >> 2] = id
        }
    },
    getSource: (shader, count, string, length) => {
        var source = "";
        for (var i = 0; i < count; ++i) {
            var len = length ? HEAPU32[length + i * 4 >> 2] : undefined;
            source += UTF8ToString(HEAPU32[string + i * 4 >> 2], len)
        }
        return source
    },
    createContext: (canvas, webGLContextAttributes) => {
        if (!canvas.getContextSafariWebGL2Fixed) {
            canvas.getContextSafariWebGL2Fixed = canvas.getContext;

            function fixedGetContext(ver, attrs) {
                var gl = canvas.getContextSafariWebGL2Fixed(ver, attrs);
                return ver == "webgl" == gl instanceof WebGLRenderingContext ? gl : null
            }
            canvas.getContext = fixedGetContext
        }
        var ctx = canvas.getContext("webgl", webGLContextAttributes);
        if (!ctx) return 0;
        var handle = GL.registerContext(ctx, webGLContextAttributes);
        return handle
    },
    registerContext: (ctx, webGLContextAttributes) => {
        var handle = GL.getNewId(GL.contexts);
        var context = {
            handle,
            attributes: webGLContextAttributes,
            version: webGLContextAttributes.majorVersion,
            GLctx: ctx
        };
        if (ctx.canvas) ctx.canvas.GLctxObject = context;
        GL.contexts[handle] = context;
        if (typeof webGLContextAttributes.enableExtensionsByDefault == "undefined" || webGLContextAttributes.enableExtensionsByDefault) {
            GL.initExtensions(context)
        }
        return handle
    },
    makeContextCurrent: contextHandle => {
        GL.currentContext = GL.contexts[contextHandle];
        Module["ctx"] = GLctx = GL.currentContext?.GLctx;
        return !(contextHandle && !GLctx)
    },
    getContext: contextHandle => GL.contexts[contextHandle],
    deleteContext: contextHandle => {
        if (GL.currentContext === GL.contexts[contextHandle]) {
            GL.currentContext = null
        }
        if (typeof JSEvents == "object") {
            JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas)
        }
        if (GL.contexts[contextHandle]?.GLctx.canvas) {
            GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined
        }
        GL.contexts[contextHandle] = null
    },
    initExtensions: context => {
        context ||= GL.currentContext;
        if (context.initExtensionsDone) return;
        context.initExtensionsDone = true;
        var GLctx = context.GLctx;
        webgl_enable_WEBGL_multi_draw(GLctx);
        webgl_enable_EXT_polygon_offset_clamp(GLctx);
        webgl_enable_EXT_clip_control(GLctx);
        webgl_enable_WEBGL_polygon_mode(GLctx);
        webgl_enable_ANGLE_instanced_arrays(GLctx);
        webgl_enable_OES_vertex_array_object(GLctx);
        webgl_enable_WEBGL_draw_buffers(GLctx);
        {
            GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query")
        }
        for (var ext of getEmscriptenSupportedExtensions(GLctx)) {
            if (!ext.includes("lose_context") && !ext.includes("debug")) {
                GLctx.getExtension(ext)
            }
        }
    }
};
var _eglCreateContext = (display, config, hmm, contextAttribs) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    var glesContextVersion = 1;
    for (;;) {
        var param = HEAP32[contextAttribs >> 2];
        if (param == 12440) {
            glesContextVersion = HEAP32[contextAttribs + 4 >> 2]
        } else if (param == 12344) {
            break
        } else {
            EGL.setErrorCode(12292);
            return 0
        }
        contextAttribs += 8
    }
    if (glesContextVersion != 2) {
        EGL.setErrorCode(12293);
        return 0
    }
    EGL.contextAttributes.majorVersion = glesContextVersion - 1;
    EGL.contextAttributes.minorVersion = 0;
    EGL.context = GL.createContext(Browser.getCanvas(), EGL.contextAttributes);
    if (EGL.context != 0) {
        EGL.setErrorCode(12288);
        GL.makeContextCurrent(EGL.context);
        Browser.useWebGL = true;
        Browser.moduleContextCreatedCallbacks.forEach(callback => callback());
        GL.makeContextCurrent(null);
        return 62004
    } else {
        EGL.setErrorCode(12297);
        return 0
    }
};
var _eglCreateWindowSurface = (display, config, win, attrib_list) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (config != 62002) {
        EGL.setErrorCode(12293);
        return 0
    }
    EGL.setErrorCode(12288);
    return 62006
};
var _eglDestroyContext = (display, context) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (context != 62004) {
        EGL.setErrorCode(12294);
        return 0
    }
    GL.deleteContext(EGL.context);
    EGL.setErrorCode(12288);
    if (EGL.currentContext == context) {
        EGL.currentContext = 0
    }
    return 1
};
var _eglDestroySurface = (display, surface) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (surface != 62006) {
        EGL.setErrorCode(12301);
        return 1
    }
    if (EGL.currentReadSurface == surface) {
        EGL.currentReadSurface = 0
    }
    if (EGL.currentDrawSurface == surface) {
        EGL.currentDrawSurface = 0
    }
    EGL.setErrorCode(12288);
    return 1
};
var _eglGetConfigAttrib = (display, config, attribute, value) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (config != 62002) {
        EGL.setErrorCode(12293);
        return 0
    }
    if (!value) {
        EGL.setErrorCode(12300);
        return 0
    }
    EGL.setErrorCode(12288);
    switch (attribute) {
        case 12320:
            HEAP32[value >> 2] = EGL.contextAttributes.alpha ? 32 : 24;
            return 1;
        case 12321:
            HEAP32[value >> 2] = EGL.contextAttributes.alpha ? 8 : 0;
            return 1;
        case 12322:
            HEAP32[value >> 2] = 8;
            return 1;
        case 12323:
            HEAP32[value >> 2] = 8;
            return 1;
        case 12324:
            HEAP32[value >> 2] = 8;
            return 1;
        case 12325:
            HEAP32[value >> 2] = EGL.contextAttributes.depth ? 24 : 0;
            return 1;
        case 12326:
            HEAP32[value >> 2] = EGL.contextAttributes.stencil ? 8 : 0;
            return 1;
        case 12327:
            HEAP32[value >> 2] = 12344;
            return 1;
        case 12328:
            HEAP32[value >> 2] = 62002;
            return 1;
        case 12329:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12330:
            HEAP32[value >> 2] = 4096;
            return 1;
        case 12331:
            HEAP32[value >> 2] = 16777216;
            return 1;
        case 12332:
            HEAP32[value >> 2] = 4096;
            return 1;
        case 12333:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12334:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12335:
            HEAP32[value >> 2] = 12344;
            return 1;
        case 12337:
            HEAP32[value >> 2] = EGL.contextAttributes.antialias ? 4 : 0;
            return 1;
        case 12338:
            HEAP32[value >> 2] = EGL.contextAttributes.antialias ? 1 : 0;
            return 1;
        case 12339:
            HEAP32[value >> 2] = 4;
            return 1;
        case 12340:
            HEAP32[value >> 2] = 12344;
            return 1;
        case 12341:
        case 12342:
        case 12343:
            HEAP32[value >> 2] = -1;
            return 1;
        case 12345:
        case 12346:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12347:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12348:
            HEAP32[value >> 2] = 1;
            return 1;
        case 12349:
        case 12350:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12351:
            HEAP32[value >> 2] = 12430;
            return 1;
        case 12352:
            HEAP32[value >> 2] = 4;
            return 1;
        case 12354:
            HEAP32[value >> 2] = 0;
            return 1;
        default:
            EGL.setErrorCode(12292);
            return 0
    }
};
var _eglGetDisplay = nativeDisplayType => {
    EGL.setErrorCode(12288);
    if (nativeDisplayType != 0 && nativeDisplayType != 1) {
        return 0
    }
    return 62e3
};
var _eglGetError = () => EGL.errorCode;
var _eglInitialize = (display, majorVersion, minorVersion) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (majorVersion) {
        HEAP32[majorVersion >> 2] = 1
    }
    if (minorVersion) {
        HEAP32[minorVersion >> 2] = 4
    }
    EGL.defaultDisplayInitialized = true;
    EGL.setErrorCode(12288);
    return 1
};
var _eglMakeCurrent = (display, draw, read, context) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (context != 0 && context != 62004) {
        EGL.setErrorCode(12294);
        return 0
    }
    if (read != 0 && read != 62006 || draw != 0 && draw != 62006) {
        EGL.setErrorCode(12301);
        return 0
    }
    GL.makeContextCurrent(context ? EGL.context : null);
    EGL.currentContext = context;
    EGL.currentDrawSurface = draw;
    EGL.currentReadSurface = read;
    EGL.setErrorCode(12288);
    return 1
};
var stringToNewUTF8 = str => {
    var size = lengthBytesUTF8(str) + 1;
    var ret = _malloc(size);
    if (ret) stringToUTF8(str, ret, size);
    return ret
};
var _eglQueryString = (display, name) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    EGL.setErrorCode(12288);
    if (EGL.stringCache[name]) return EGL.stringCache[name];
    var ret;
    switch (name) {
        case 12371:
            ret = stringToNewUTF8("Emscripten");
            break;
        case 12372:
            ret = stringToNewUTF8("1.4 Emscripten EGL");
            break;
        case 12373:
            ret = stringToNewUTF8("");
            break;
        case 12429:
            ret = stringToNewUTF8("OpenGL_ES");
            break;
        default:
            EGL.setErrorCode(12300);
            return 0
    }
    EGL.stringCache[name] = ret;
    return ret
};
var _eglSwapBuffers = (dpy, surface) => {
    if (!EGL.defaultDisplayInitialized) {
        EGL.setErrorCode(12289)
    } else if (!GLctx) {
        EGL.setErrorCode(12290)
    } else if (GLctx.isContextLost()) {
        EGL.setErrorCode(12302)
    } else {
        EGL.setErrorCode(12288);
        return 1
    }
    return 0
};
var setMainLoop = (iterFunc, fps, simulateInfiniteLoop, arg, noSetTiming) => {
    MainLoop.func = iterFunc;
    MainLoop.arg = arg;
    var thisMainLoopId = MainLoop.currentlyRunningMainloop;

    function checkIsRunning() {
        if (thisMainLoopId < MainLoop.currentlyRunningMainloop) {
            maybeExit();
            return false
        }
        return true
    }
    MainLoop.running = false;
    MainLoop.runner = function MainLoop_runner() {
        if (ABORT) return;
        if (MainLoop.queue.length > 0) {
            var start = Date.now();
            var blocker = MainLoop.queue.shift();
            blocker.func(blocker.arg);
            if (MainLoop.remainingBlockers) {
                var remaining = MainLoop.remainingBlockers;
                var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
                if (blocker.counted) {
                    MainLoop.remainingBlockers = next
                } else {
                    next = next + .5;
                    MainLoop.remainingBlockers = (8 * remaining + next) / 9
                }
            }
            MainLoop.updateStatus();
            if (!checkIsRunning()) return;
            setTimeout(MainLoop.runner, 0);
            return
        }
        if (!checkIsRunning()) return;
        MainLoop.currentFrameNumber = MainLoop.currentFrameNumber + 1 | 0;
        if (MainLoop.timingMode == 1 && MainLoop.timingValue > 1 && MainLoop.currentFrameNumber % MainLoop.timingValue != 0) {
            MainLoop.scheduler();
            return
        } else if (MainLoop.timingMode == 0) {
            MainLoop.tickStartTime = _emscripten_get_now()
        }
        MainLoop.runIter(iterFunc);
        if (!checkIsRunning()) return;
        MainLoop.scheduler()
    };
    if (!noSetTiming) {
        if (fps > 0) {
            _emscripten_set_main_loop_timing(0, 1e3 / fps)
        } else {
            _emscripten_set_main_loop_timing(1, 1)
        }
        MainLoop.scheduler()
    }
    if (simulateInfiniteLoop) {
        throw "unwind"
    }
};
var MainLoop = {
    running: false,
    scheduler: null,
    method: "",
    currentlyRunningMainloop: 0,
    func: null,
    arg: 0,
    timingMode: 0,
    timingValue: 0,
    currentFrameNumber: 0,
    queue: [],
    preMainLoop: [],
    postMainLoop: [],
    pause() {
        MainLoop.scheduler = null;
        MainLoop.currentlyRunningMainloop++
    },
    resume() {
        MainLoop.currentlyRunningMainloop++;
        var timingMode = MainLoop.timingMode;
        var timingValue = MainLoop.timingValue;
        var func = MainLoop.func;
        MainLoop.func = null;
        setMainLoop(func, 0, false, MainLoop.arg, true);
        _emscripten_set_main_loop_timing(timingMode, timingValue);
        MainLoop.scheduler()
    },
    updateStatus() {
        if (Module["setStatus"]) {
            var message = Module["statusMessage"] || "Please wait...";
            var remaining = MainLoop.remainingBlockers ?? 0;
            var expected = MainLoop.expectedBlockers ?? 0;
            if (remaining) {
                if (remaining < expected) {
                    Module["setStatus"](`{message} ({expected - remaining}/{expected})`)
                } else {
                    Module["setStatus"](message)
                }
            } else {
                Module["setStatus"]("")
            }
        }
    },
    init() {
        Module["preMainLoop"] && MainLoop.preMainLoop.push(Module["preMainLoop"]);
        Module["postMainLoop"] && MainLoop.postMainLoop.push(Module["postMainLoop"])
    },
    runIter(func) {
        if (ABORT) return;
        for (var pre of MainLoop.preMainLoop) {
            if (pre() === false) {
                return
            }
        }
        callUserCallback(func);
        for (var post of MainLoop.postMainLoop) {
            post()
        }
    },
    nextRAF: 0,
    fakeRequestAnimationFrame(func) {
        var now = Date.now();
        if (MainLoop.nextRAF === 0) {
            MainLoop.nextRAF = now + 1e3 / 60
        } else {
            while (now + 2 >= MainLoop.nextRAF) {
                MainLoop.nextRAF += 1e3 / 60
            }
        }
        var delay = Math.max(MainLoop.nextRAF - now, 0);
        setTimeout(func, delay)
    },
    requestAnimationFrame(func) {
        if (globalThis.requestAnimationFrame) {
            requestAnimationFrame(func)
        } else {
            MainLoop.fakeRequestAnimationFrame(func)
        }
    }
};
var _emscripten_set_main_loop_timing = (mode, value) => {
    MainLoop.timingMode = mode;
    MainLoop.timingValue = value;
    if (!MainLoop.func) {
        return 1
    }
    if (!MainLoop.running) {
        MainLoop.running = true
    }
    if (mode == 0) {
        MainLoop.scheduler = function MainLoop_scheduler_setTimeout() {
            var timeUntilNextTick = Math.max(0, MainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
            setTimeout(MainLoop.runner, timeUntilNextTick)
        };
        MainLoop.method = "timeout"
    } else if (mode == 1) {
        MainLoop.scheduler = function MainLoop_scheduler_rAF() {
            MainLoop.requestAnimationFrame(MainLoop.runner)
        };
        MainLoop.method = "rAF"
    } else if (mode == 2) {
        if (!MainLoop.setImmediate) {
            if (globalThis.setImmediate) {
                MainLoop.setImmediate = setImmediate
            } else {
                var setImmediates = [];
                var emscriptenMainLoopMessageId = "setimmediate";
                var MainLoop_setImmediate_messageHandler = event => {
                    if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
                        event.stopPropagation();
                        setImmediates.shift()()
                    }
                };
                addEventListener("message", MainLoop_setImmediate_messageHandler, true);
                MainLoop.setImmediate = func => {
                    setImmediates.push(func);
                    if (ENVIRONMENT_IS_WORKER) {
                        Module["setImmediates"] ??= [];
                        Module["setImmediates"].push(func);
                        postMessage({
                            target: emscriptenMainLoopMessageId
                        })
                    } else postMessage(emscriptenMainLoopMessageId, "*")
                }
            }
        }
        MainLoop.scheduler = function MainLoop_scheduler_setImmediate() {
            MainLoop.setImmediate(MainLoop.runner)
        };
        MainLoop.method = "immediate"
    }
    return 0
};
var _eglSwapInterval = (display, interval) => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (interval == 0) _emscripten_set_main_loop_timing(0, 0);
    else _emscripten_set_main_loop_timing(1, interval);
    EGL.setErrorCode(12288);
    return 1
};
var _eglTerminate = display => {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    EGL.currentContext = 0;
    EGL.currentReadSurface = 0;
    EGL.currentDrawSurface = 0;
    EGL.defaultDisplayInitialized = false;
    EGL.setErrorCode(12288);
    return 1
};
var _eglWaitClient = () => {
    EGL.setErrorCode(12288);
    return 1
};
var _eglWaitGL = _eglWaitClient;
var _eglWaitNative = nativeEngineId => {
    EGL.setErrorCode(12288);
    return 1
};
var readEmAsmArgsArray = [];
var readEmAsmArgs = (sigPtr, buf) => {
    readEmAsmArgsArray.length = 0;
    var ch;
    while (ch = HEAPU8[sigPtr++]) {
        var wide = ch != 105;
        wide &= ch != 112;
        buf += wide && buf % 8 ? 4 : 0;
        readEmAsmArgsArray.push(ch == 112 ? HEAPU32[buf >> 2] : ch == 106 ? HEAP64[buf >> 3] : ch == 105 ? HEAP32[buf >> 2] : HEAPF64[buf >> 3]);
        buf += wide ? 8 : 4
    }
    return readEmAsmArgsArray
};
var runEmAsmFunction = (code, sigPtr, argbuf) => {
    var args = readEmAsmArgs(sigPtr, argbuf);
    return ASM_CONSTS[code](...args)
};
var _emscripten_asm_const_int = (code, sigPtr, argbuf) => runEmAsmFunction(code, sigPtr, argbuf);
var runMainThreadEmAsm = (emAsmAddr, sigPtr, argbuf, sync) => {
    var args = readEmAsmArgs(sigPtr, argbuf);
    return ASM_CONSTS[emAsmAddr](...args)
};
var _emscripten_asm_const_int_sync_on_main_thread = (emAsmAddr, sigPtr, argbuf) => runMainThreadEmAsm(emAsmAddr, sigPtr, argbuf, 1);
var _emscripten_asm_const_ptr_sync_on_main_thread = (emAsmAddr, sigPtr, argbuf) => runMainThreadEmAsm(emAsmAddr, sigPtr, argbuf, 1);
var _emscripten_cancel_main_loop = () => {
    MainLoop.pause();
    MainLoop.func = null
};
var _emscripten_clear_timeout = clearTimeout;
var JSEvents = {
    removeAllEventListeners() {
        while (JSEvents.eventHandlers.length) {
            JSEvents._removeHandler(JSEvents.eventHandlers.length - 1)
        }
        JSEvents.deferredCalls = []
    },
    inEventHandler: 0,
    deferredCalls: [],
    deferCall(targetFunction, precedence, argsList) {
        function arraysHaveEqualContent(arrA, arrB) {
            if (arrA.length != arrB.length) return false;
            for (var i in arrA) {
                if (arrA[i] != arrB[i]) return false
            }
            return true
        }
        for (var call of JSEvents.deferredCalls) {
            if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
                return
            }
        }
        JSEvents.deferredCalls.push({
            targetFunction,
            precedence,
            argsList
        });
        JSEvents.deferredCalls.sort((x, y) => x.precedence < y.precedence)
    },
    removeDeferredCalls(targetFunction) {
        JSEvents.deferredCalls = JSEvents.deferredCalls.filter(call => call.targetFunction != targetFunction)
    },
    canPerformEventHandlerRequests() {
        if (navigator.userActivation) {
            return navigator.userActivation.isActive
        }
        return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls
    },
    runDeferredCalls() {
        if (!JSEvents.canPerformEventHandlerRequests()) {
            return
        }
        var deferredCalls = JSEvents.deferredCalls;
        JSEvents.deferredCalls = [];
        for (var call of deferredCalls) {
            call.targetFunction(...call.argsList)
        }
    },
    eventHandlers: [],
    removeAllHandlersOnTarget: (target, eventTypeString) => {
        for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
            if (JSEvents.eventHandlers[i].target == target && (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
                JSEvents._removeHandler(i--)
            }
        }
    },
    _removeHandler(i) {
        var h = JSEvents.eventHandlers[i];
        h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
        JSEvents.eventHandlers.splice(i, 1)
    },
    registerOrRemoveHandler(eventHandler) {
        if (!eventHandler.target) {
            return -4
        }
        if (eventHandler.callbackfunc) {
            eventHandler.eventListenerFunc = function(event) {
                ++JSEvents.inEventHandler;
                JSEvents.currentEventHandler = eventHandler;
                JSEvents.runDeferredCalls();
                eventHandler.handlerFunc(event);
                JSEvents.runDeferredCalls();
                --JSEvents.inEventHandler
            };
            eventHandler.target.addEventListener(eventHandler.eventTypeString, eventHandler.eventListenerFunc, eventHandler.useCapture);
            JSEvents.eventHandlers.push(eventHandler)
        } else {
            for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
                if (JSEvents.eventHandlers[i].target == eventHandler.target && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
                    JSEvents._removeHandler(i--)
                }
            }
        }
        return 0
    },
    removeSingleHandler(eventHandler) {
        let success = false;
        for (let i = 0; i < JSEvents.eventHandlers.length; ++i) {
            const handler = JSEvents.eventHandlers[i];
            if (handler.target === eventHandler.target && handler.eventTypeId === eventHandler.eventTypeId && handler.callbackfunc === eventHandler.callbackfunc && handler.userData === eventHandler.userData) {
                JSEvents._removeHandler(i--);
                success = true
            }
        }
        return success ? 0 : -5
    },
    getNodeNameForTarget(target) {
        if (!target) return "";
        if (target == window) return "#window";
        if (target == screen) return "#screen";
        return target?.nodeName || ""
    },
    fullscreenEnabled() {
        return document.fullscreenEnabled || document.webkitFullscreenEnabled
    }
};
var specialHTMLTargets = [0, globalThis.document ?? 0, globalThis.window ?? 0];
var maybeCStringToJsString = cString => cString > 2 ? UTF8ToString(cString) : cString;
var findEventTarget = target => {
    target = maybeCStringToJsString(target);
    var domElement = specialHTMLTargets[target] || globalThis.document?.querySelector(target);
    return domElement
};
var findCanvasEventTarget = findEventTarget;
var _emscripten_get_canvas_element_size = (target, width, height) => {
    var canvas = findCanvasEventTarget(target);
    if (!canvas) return -4;
    HEAP32[width >> 2] = canvas.width;
    HEAP32[height >> 2] = canvas.height
};
var stackAlloc = sz => __emscripten_stack_alloc(sz);
var stringToUTF8OnStack = str => {
    var size = lengthBytesUTF8(str) + 1;
    var ret = stackAlloc(size);
    stringToUTF8(str, ret, size);
    return ret
};
var getCanvasElementSize = target => {
    var sp = stackSave();
    var w = stackAlloc(8);
    var h = w + 4;
    var targetInt = stringToUTF8OnStack(target.id);
    var ret = _emscripten_get_canvas_element_size(targetInt, w, h);
    var size = [HEAP32[w >> 2], HEAP32[h >> 2]];
    stackRestore(sp);
    return size
};
var _emscripten_set_canvas_element_size = (target, width, height) => {
    var canvas = findCanvasEventTarget(target);
    if (!canvas) return -4;
    canvas.width = width;
    canvas.height = height;
    return 0
};
var setCanvasElementSize = (target, width, height) => {
    if (!target.controlTransferredOffscreen) {
        target.width = width;
        target.height = height
    } else {
        var sp = stackSave();
        var targetInt = stringToUTF8OnStack(target.id);
        _emscripten_set_canvas_element_size(targetInt, width, height);
        stackRestore(sp)
    }
};
var currentFullscreenStrategy = {};
var getWasmTableEntry = funcPtr => wasmTable.get(funcPtr);
var registerRestoreOldStyle = canvas => {
    var canvasSize = getCanvasElementSize(canvas);
    var oldWidth = canvasSize[0];
    var oldHeight = canvasSize[1];
    var oldCssWidth = canvas.style.width;
    var oldCssHeight = canvas.style.height;
    var oldBackgroundColor = canvas.style.backgroundColor;
    var oldDocumentBackgroundColor = document.body.style.backgroundColor;
    var oldPaddingLeft = canvas.style.paddingLeft;
    var oldPaddingRight = canvas.style.paddingRight;
    var oldPaddingTop = canvas.style.paddingTop;
    var oldPaddingBottom = canvas.style.paddingBottom;
    var oldMarginLeft = canvas.style.marginLeft;
    var oldMarginRight = canvas.style.marginRight;
    var oldMarginTop = canvas.style.marginTop;
    var oldMarginBottom = canvas.style.marginBottom;
    var oldDocumentBodyMargin = document.body.style.margin;
    var oldDocumentOverflow = document.documentElement.style.overflow;
    var oldDocumentScroll = document.body.scroll;
    var oldImageRendering = canvas.style.imageRendering;

    function restoreOldStyle() {
        if (!getFullscreenElement()) {
            document.removeEventListener("fullscreenchange", restoreOldStyle);
            document.removeEventListener("webkitfullscreenchange", restoreOldStyle);
            setCanvasElementSize(canvas, oldWidth, oldHeight);
            canvas.style.width = oldCssWidth;
            canvas.style.height = oldCssHeight;
            canvas.style.backgroundColor = oldBackgroundColor;
            if (!oldDocumentBackgroundColor) document.body.style.backgroundColor = "white";
            document.body.style.backgroundColor = oldDocumentBackgroundColor;
            canvas.style.paddingLeft = oldPaddingLeft;
            canvas.style.paddingRight = oldPaddingRight;
            canvas.style.paddingTop = oldPaddingTop;
            canvas.style.paddingBottom = oldPaddingBottom;
            canvas.style.marginLeft = oldMarginLeft;
            canvas.style.marginRight = oldMarginRight;
            canvas.style.marginTop = oldMarginTop;
            canvas.style.marginBottom = oldMarginBottom;
            document.body.style.margin = oldDocumentBodyMargin;
            document.documentElement.style.overflow = oldDocumentOverflow;
            document.body.scroll = oldDocumentScroll;
            canvas.style.imageRendering = oldImageRendering;
            if (canvas.GLctxObject) canvas.GLctxObject.GLctx.viewport(0, 0, oldWidth, oldHeight);
            if (currentFullscreenStrategy.canvasResizedCallback) {
                getWasmTableEntry(currentFullscreenStrategy.canvasResizedCallback)(37, 0, currentFullscreenStrategy.canvasResizedCallbackUserData)
            }
        }
    }
    document.addEventListener("fullscreenchange", restoreOldStyle);
    document.addEventListener("webkitfullscreenchange", restoreOldStyle);
    return restoreOldStyle
};
var setLetterbox = (element, topBottom, leftRight) => {
    element.style.paddingLeft = element.style.paddingRight = leftRight + "px";
    element.style.paddingTop = element.style.paddingBottom = topBottom + "px"
};
var getBoundingClientRect = e => specialHTMLTargets.indexOf(e) < 0 ? e.getBoundingClientRect() : {
    left: 0,
    top: 0
};
var JSEvents_resizeCanvasForFullscreen = (target, strategy) => {
    var restoreOldStyle = registerRestoreOldStyle(target);
    var cssWidth = strategy.softFullscreen ? innerWidth : screen.width;
    var cssHeight = strategy.softFullscreen ? innerHeight : screen.height;
    var rect = getBoundingClientRect(target);
    var windowedCssWidth = rect.width;
    var windowedCssHeight = rect.height;
    var canvasSize = getCanvasElementSize(target);
    var windowedRttWidth = canvasSize[0];
    var windowedRttHeight = canvasSize[1];
    if (strategy.scaleMode == 3) {
        setLetterbox(target, (cssHeight - windowedCssHeight) / 2, (cssWidth - windowedCssWidth) / 2);
        cssWidth = windowedCssWidth;
        cssHeight = windowedCssHeight
    } else if (strategy.scaleMode == 2) {
        if (cssWidth * windowedRttHeight < windowedRttWidth * cssHeight) {
            var desiredCssHeight = windowedRttHeight * cssWidth / windowedRttWidth;
            setLetterbox(target, (cssHeight - desiredCssHeight) / 2, 0);
            cssHeight = desiredCssHeight
        } else {
            var desiredCssWidth = windowedRttWidth * cssHeight / windowedRttHeight;
            setLetterbox(target, 0, (cssWidth - desiredCssWidth) / 2);
            cssWidth = desiredCssWidth
        }
    }
    target.style.backgroundColor ||= "black";
    document.body.style.backgroundColor ||= "black";
    target.style.width = cssWidth + "px";
    target.style.height = cssHeight + "px";
    if (strategy.filteringMode == 1) {
        target.style.imageRendering = "optimizeSpeed";
        target.style.imageRendering = "-moz-crisp-edges";
        target.style.imageRendering = "-o-crisp-edges";
        target.style.imageRendering = "-webkit-optimize-contrast";
        target.style.imageRendering = "optimize-contrast";
        target.style.imageRendering = "crisp-edges";
        target.style.imageRendering = "pixelated"
    }
    var dpiScale = strategy.canvasResolutionScaleMode == 2 ? devicePixelRatio : 1;
    if (strategy.canvasResolutionScaleMode != 0) {
        var newWidth = cssWidth * dpiScale | 0;
        var newHeight = cssHeight * dpiScale | 0;
        setCanvasElementSize(target, newWidth, newHeight);
        if (target.GLctxObject) target.GLctxObject.GLctx.viewport(0, 0, newWidth, newHeight)
    }
    return restoreOldStyle
};
var JSEvents_requestFullscreen = (target, strategy) => {
    if (strategy.scaleMode != 0 || strategy.canvasResolutionScaleMode != 0) {
        JSEvents_resizeCanvasForFullscreen(target, strategy)
    }
    if (target.requestFullscreen) {
        target.requestFullscreen()
    } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT)
    } else {
        return JSEvents.fullscreenEnabled() ? -3 : -1
    }
    currentFullscreenStrategy = strategy;
    if (strategy.canvasResizedCallback) {
        getWasmTableEntry(strategy.canvasResizedCallback)(37, 0, strategy.canvasResizedCallbackUserData)
    }
    return 0
};
var _emscripten_exit_fullscreen = () => {
    if (!JSEvents.fullscreenEnabled()) return -1;
    JSEvents.removeDeferredCalls(JSEvents_requestFullscreen);
    var d = specialHTMLTargets[1];
    if (d.exitFullscreen) {
        d.fullscreenElement && d.exitFullscreen()
    } else if (d.webkitExitFullscreen) {
        d.webkitFullscreenElement && d.webkitExitFullscreen()
    } else {
        return -1
    }
    return 0
};
var requestPointerLock = target => {
    if (target.requestPointerLock) {
        target.requestPointerLock()
    } else {
        if (document.body.requestPointerLock) {
            return -3
        }
        return -1
    }
    return 0
};
var _emscripten_exit_pointerlock = () => {
    JSEvents.removeDeferredCalls(requestPointerLock);
    if (!document.exitPointerLock) return -1;
    document.exitPointerLock();
    return 0
};
var __emscripten_runtime_keepalive_clear = () => {
    noExitRuntime = false;
    runtimeKeepaliveCounter = 0
};
var _emscripten_force_exit = status => {
    __emscripten_runtime_keepalive_clear();
    _exit(status)
};
var _emscripten_get_device_pixel_ratio = () => globalThis.devicePixelRatio ?? 1;
var _emscripten_get_element_css_size = (target, width, height) => {
    target = findEventTarget(target);
    if (!target) return -4;
    var rect = getBoundingClientRect(target);
    HEAPF64[width >> 3] = rect.width;
    HEAPF64[height >> 3] = rect.height;
    return 0
};
var fillGamepadEventData = (eventStruct, e) => {
    HEAPF64[eventStruct >> 3] = e.timestamp;
    for (var i = 0; i < e.axes.length; ++i) {
        HEAPF64[eventStruct + i * 8 + 16 >> 3] = e.axes[i]
    }
    for (var i = 0; i < e.buttons.length; ++i) {
        if (typeof e.buttons[i] == "object") {
            HEAPF64[eventStruct + i * 8 + 528 >> 3] = e.buttons[i].value
        } else {
            HEAPF64[eventStruct + i * 8 + 528 >> 3] = e.buttons[i]
        }
    }
    for (var i = 0; i < e.buttons.length; ++i) {
        if (typeof e.buttons[i] == "object") {
            HEAP8[eventStruct + i + 1040] = e.buttons[i].pressed
        } else {
            HEAP8[eventStruct + i + 1040] = e.buttons[i] == 1
        }
    }
    HEAP8[eventStruct + 1104] = e.connected;
    HEAP32[eventStruct + 1108 >> 2] = e.index;
    HEAP32[eventStruct + 8 >> 2] = e.axes.length;
    HEAP32[eventStruct + 12 >> 2] = e.buttons.length;
    stringToUTF8(e.id, eventStruct + 1112, 64);
    stringToUTF8(e.mapping, eventStruct + 1176, 64)
};
var _emscripten_get_gamepad_status = (index, gamepadState) => {
    if (index < 0 || index >= JSEvents.lastGamepadState.length) return -5;
    if (!JSEvents.lastGamepadState[index]) return -7;
    fillGamepadEventData(gamepadState, JSEvents.lastGamepadState[index]);
    return 0
};
var getHeapMax = () => 2147483648;
var _emscripten_get_heap_max = () => getHeapMax();
var _emscripten_get_num_gamepads = () => JSEvents.lastGamepadState.length;
var _emscripten_get_screen_size = (width, height) => {
    HEAP32[width >> 2] = screen.width;
    HEAP32[height >> 2] = screen.height
};
var _emscripten_glActiveTexture = x0 => GLctx.activeTexture(x0);
var _emscripten_glAttachShader = (program, shader) => {
    GLctx.attachShader(GL.programs[program], GL.shaders[shader])
};
var _emscripten_glBeginQueryEXT = (target, id) => {
    GLctx.disjointTimerQueryExt["beginQueryEXT"](target, GL.queries[id])
};
var _emscripten_glBindAttribLocation = (program, index, name) => {
    GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name))
};
var _emscripten_glBindBuffer = (target, buffer) => {
    GLctx.bindBuffer(target, GL.buffers[buffer])
};
var _emscripten_glBindFramebuffer = (target, framebuffer) => {
    GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer])
};
var _emscripten_glBindRenderbuffer = (target, renderbuffer) => {
    GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer])
};
var _emscripten_glBindTexture = (target, texture) => {
    GLctx.bindTexture(target, GL.textures[texture])
};
var _emscripten_glBindVertexArray = vao => {
    GLctx.bindVertexArray(GL.vaos[vao])
};
var _glBindVertexArray = _emscripten_glBindVertexArray;
var _emscripten_glBindVertexArrayOES = _glBindVertexArray;
var _emscripten_glBlendColor = (x0, x1, x2, x3) => GLctx.blendColor(x0, x1, x2, x3);
var _emscripten_glBlendEquation = x0 => GLctx.blendEquation(x0);
var _emscripten_glBlendEquationSeparate = (x0, x1) => GLctx.blendEquationSeparate(x0, x1);
var _emscripten_glBlendFunc = (x0, x1) => GLctx.blendFunc(x0, x1);
var _emscripten_glBlendFuncSeparate = (x0, x1, x2, x3) => GLctx.blendFuncSeparate(x0, x1, x2, x3);
var _emscripten_glBufferData = (target, size, data, usage) => {
    GLctx.bufferData(target, data ? HEAPU8.subarray(data, data + size) : size, usage)
};
var _emscripten_glBufferSubData = (target, offset, size, data) => {
    GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size))
};
var _emscripten_glCheckFramebufferStatus = x0 => GLctx.checkFramebufferStatus(x0);
var _emscripten_glClear = x0 => GLctx.clear(x0);
var _emscripten_glClearColor = (x0, x1, x2, x3) => GLctx.clearColor(x0, x1, x2, x3);
var _emscripten_glClearDepthf = x0 => GLctx.clearDepth(x0);
var _emscripten_glClearStencil = x0 => GLctx.clearStencil(x0);
var _emscripten_glClipControlEXT = (origin, depth) => {
    GLctx.extClipControl["clipControlEXT"](origin, depth)
};
var _emscripten_glColorMask = (red, green, blue, alpha) => {
    GLctx.colorMask(!!red, !!green, !!blue, !!alpha)
};
var _emscripten_glCompileShader = shader => {
    GLctx.compileShader(GL.shaders[shader])
};
var _emscripten_glCompressedTexImage2D = (target, level, internalFormat, width, height, border, imageSize, data) => {
    GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, HEAPU8.subarray(data, data + imageSize))
};
var _emscripten_glCompressedTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, imageSize, data) => {
    GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, HEAPU8.subarray(data, data + imageSize))
};
var _emscripten_glCopyTexImage2D = (x0, x1, x2, x3, x4, x5, x6, x7) => GLctx.copyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7);
var _emscripten_glCopyTexSubImage2D = (x0, x1, x2, x3, x4, x5, x6, x7) => GLctx.copyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7);
var _emscripten_glCreateProgram = () => {
    var id = GL.getNewId(GL.programs);
    var program = GLctx.createProgram();
    program.name = id;
    program.maxUniformLength = program.maxAttributeLength = program.maxUniformBlockNameLength = 0;
    program.uniformIdCounter = 1;
    GL.programs[id] = program;
    return id
};
var _emscripten_glCreateShader = shaderType => {
    var id = GL.getNewId(GL.shaders);
    GL.shaders[id] = GLctx.createShader(shaderType);
    return id
};
var _emscripten_glCullFace = x0 => GLctx.cullFace(x0);
var _emscripten_glDeleteBuffers = (n, buffers) => {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[buffers + i * 4 >> 2];
        var buffer = GL.buffers[id];
        if (!buffer) continue;
        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null
    }
};
var _emscripten_glDeleteFramebuffers = (n, framebuffers) => {
    for (var i = 0; i < n; ++i) {
        var id = HEAP32[framebuffers + i * 4 >> 2];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue;
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null
    }
};
var _emscripten_glDeleteProgram = id => {
    if (!id) return;
    var program = GL.programs[id];
    if (!program) {
        GL.recordError(1281);
        return
    }
    GLctx.deleteProgram(program);
    program.name = 0;
    GL.programs[id] = null
};
var _emscripten_glDeleteQueriesEXT = (n, ids) => {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[ids + i * 4 >> 2];
        var query = GL.queries[id];
        if (!query) continue;
        GLctx.disjointTimerQueryExt["deleteQueryEXT"](query);
        GL.queries[id] = null
    }
};
var _emscripten_glDeleteRenderbuffers = (n, renderbuffers) => {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[renderbuffers + i * 4 >> 2];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue;
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null
    }
};
var _emscripten_glDeleteShader = id => {
    if (!id) return;
    var shader = GL.shaders[id];
    if (!shader) {
        GL.recordError(1281);
        return
    }
    GLctx.deleteShader(shader);
    GL.shaders[id] = null
};
var _emscripten_glDeleteTextures = (n, textures) => {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[textures + i * 4 >> 2];
        var texture = GL.textures[id];
        if (!texture) continue;
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null
    }
};
var _emscripten_glDeleteVertexArrays = (n, vaos) => {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[vaos + i * 4 >> 2];
        GLctx.deleteVertexArray(GL.vaos[id]);
        GL.vaos[id] = null
    }
};
var _glDeleteVertexArrays = _emscripten_glDeleteVertexArrays;
var _emscripten_glDeleteVertexArraysOES = _glDeleteVertexArrays;
var _emscripten_glDepthFunc = x0 => GLctx.depthFunc(x0);
var _emscripten_glDepthMask = flag => {
    GLctx.depthMask(!!flag)
};
var _emscripten_glDepthRangef = (x0, x1) => GLctx.depthRange(x0, x1);
var _emscripten_glDetachShader = (program, shader) => {
    GLctx.detachShader(GL.programs[program], GL.shaders[shader])
};
var _emscripten_glDisable = x0 => GLctx.disable(x0);
var _emscripten_glDisableVertexAttribArray = index => {
    GLctx.disableVertexAttribArray(index)
};
var _emscripten_glDrawArrays = (mode, first, count) => {
    GLctx.drawArrays(mode, first, count)
};
var _emscripten_glDrawArraysInstanced = (mode, first, count, primcount) => {
    GLctx.drawArraysInstanced(mode, first, count, primcount)
};
var _glDrawArraysInstanced = _emscripten_glDrawArraysInstanced;
var _emscripten_glDrawArraysInstancedANGLE = _glDrawArraysInstanced;
var tempFixedLengthArray = [];
var _emscripten_glDrawBuffers = (n, bufs) => {
    var bufArray = tempFixedLengthArray[n];
    for (var i = 0; i < n; i++) {
        bufArray[i] = HEAP32[bufs + i * 4 >> 2]
    }
    GLctx.drawBuffers(bufArray)
};
var _glDrawBuffers = _emscripten_glDrawBuffers;
var _emscripten_glDrawBuffersWEBGL = _glDrawBuffers;
var _emscripten_glDrawElements = (mode, count, type, indices) => {
    GLctx.drawElements(mode, count, type, indices)
};
var _emscripten_glDrawElementsInstanced = (mode, count, type, indices, primcount) => {
    GLctx.drawElementsInstanced(mode, count, type, indices, primcount)
};
var _glDrawElementsInstanced = _emscripten_glDrawElementsInstanced;
var _emscripten_glDrawElementsInstancedANGLE = _glDrawElementsInstanced;
var _emscripten_glEnable = x0 => GLctx.enable(x0);
var _emscripten_glEnableVertexAttribArray = index => {
    GLctx.enableVertexAttribArray(index)
};
var _emscripten_glEndQueryEXT = target => {
    GLctx.disjointTimerQueryExt["endQueryEXT"](target)
};
var _emscripten_glFinish = () => GLctx.finish();
var _emscripten_glFlush = () => GLctx.flush();
var _emscripten_glFramebufferRenderbuffer = (target, attachment, renderbuffertarget, renderbuffer) => {
    GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer])
};
var _emscripten_glFramebufferTexture2D = (target, attachment, textarget, texture, level) => {
    GLctx.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level)
};
var _emscripten_glFrontFace = x0 => GLctx.frontFace(x0);
var _emscripten_glGenBuffers = (n, buffers) => {
    GL.genObject(n, buffers, "createBuffer", GL.buffers)
};
var _emscripten_glGenFramebuffers = (n, ids) => {
    GL.genObject(n, ids, "createFramebuffer", GL.framebuffers)
};
var _emscripten_glGenQueriesEXT = (n, ids) => {
    for (var i = 0; i < n; i++) {
        var query = GLctx.disjointTimerQueryExt["createQueryEXT"]();
        if (!query) {
            GL.recordError(1282);
            while (i < n) HEAP32[ids + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.queries);
        query.name = id;
        GL.queries[id] = query;
        HEAP32[ids + i * 4 >> 2] = id
    }
};
var _emscripten_glGenRenderbuffers = (n, renderbuffers) => {
    GL.genObject(n, renderbuffers, "createRenderbuffer", GL.renderbuffers)
};
var _emscripten_glGenTextures = (n, textures) => {
    GL.genObject(n, textures, "createTexture", GL.textures)
};
var _emscripten_glGenVertexArrays = (n, arrays) => {
    GL.genObject(n, arrays, "createVertexArray", GL.vaos)
};
var _glGenVertexArrays = _emscripten_glGenVertexArrays;
var _emscripten_glGenVertexArraysOES = _glGenVertexArrays;
var _emscripten_glGenerateMipmap = x0 => GLctx.generateMipmap(x0);
var __glGetActiveAttribOrUniform = (funcName, program, index, bufSize, length, size, type, name) => {
    program = GL.programs[program];
    var info = GLctx[funcName](program, index);
    if (info) {
        var numBytesWrittenExclNull = name && stringToUTF8(info.name, name, bufSize);
        if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
        if (size) HEAP32[size >> 2] = info.size;
        if (type) HEAP32[type >> 2] = info.type
    }
};
var _emscripten_glGetActiveAttrib = (program, index, bufSize, length, size, type, name) => __glGetActiveAttribOrUniform("getActiveAttrib", program, index, bufSize, length, size, type, name);
var _emscripten_glGetActiveUniform = (program, index, bufSize, length, size, type, name) => __glGetActiveAttribOrUniform("getActiveUniform", program, index, bufSize, length, size, type, name);
var _emscripten_glGetAttachedShaders = (program, maxCount, count, shaders) => {
    var result = GLctx.getAttachedShaders(GL.programs[program]);
    var len = result.length;
    if (len > maxCount) {
        len = maxCount
    }
    HEAP32[count >> 2] = len;
    for (var i = 0; i < len; ++i) {
        var id = GL.shaders.indexOf(result[i]);
        HEAP32[shaders + i * 4 >> 2] = id
    }
};
var _emscripten_glGetAttribLocation = (program, name) => GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
var writeI53ToI64 = (ptr, num) => {
    HEAPU32[ptr >> 2] = num;
    var lower = HEAPU32[ptr >> 2];
    HEAPU32[ptr + 4 >> 2] = (num - lower) / 4294967296
};
var emscriptenWebGLGet = (name_, p, type) => {
    if (!p) {
        GL.recordError(1281);
        return
    }
    var ret = undefined;
    switch (name_) {
        case 36346:
            ret = 1;
            break;
        case 36344:
            if (type != 0 && type != 1) {
                GL.recordError(1280)
            }
            return;
        case 36345:
            ret = 0;
            break;
        case 34466:
            var formats = GLctx.getParameter(34467);
            ret = formats ? formats.length : 0;
            break
    }
    if (ret === undefined) {
        var result = GLctx.getParameter(name_);
        switch (typeof result) {
            case "number":
                ret = result;
                break;
            case "boolean":
                ret = result ? 1 : 0;
                break;
            case "string":
                GL.recordError(1280);
                return;
            case "object":
                if (result === null) {
                    switch (name_) {
                        case 34964:
                        case 35725:
                        case 34965:
                        case 36006:
                        case 36007:
                        case 32873:
                        case 34229:
                        case 34068: {
                            ret = 0;
                            break
                        }
                        default: {
                            GL.recordError(1280);
                            return
                        }
                    }
                } else if (result instanceof Float32Array || result instanceof Uint32Array || result instanceof Int32Array || result instanceof Array) {
                    for (var i = 0; i < result.length; ++i) {
                        switch (type) {
                            case 0:
                                HEAP32[p + i * 4 >> 2] = result[i];
                                break;
                            case 2:
                                HEAPF32[p + i * 4 >> 2] = result[i];
                                break;
                            case 4:
                                HEAP8[p + i] = result[i] ? 1 : 0;
                                break
                        }
                    }
                    return
                } else {
                    try {
                        ret = result.name | 0
                    } catch (e) {
                        GL.recordError(1280);
                        err(`GL_INVALID_ENUM in glGet${type}v: Unknown object returned from WebGL getParameter(${name_})! (error: ${e})`);
                        return
                    }
                }
                break;
            default:
                GL.recordError(1280);
                err(`GL_INVALID_ENUM in glGet${type}v: Native code calling glGet${type}v(${name_}) and it returns ${result} of type ${typeof result}!`);
                return
        }
    }
    switch (type) {
        case 1:
            writeI53ToI64(p, ret);
            break;
        case 0:
            HEAP32[p >> 2] = ret;
            break;
        case 2:
            HEAPF32[p >> 2] = ret;
            break;
        case 4:
            HEAP8[p] = ret ? 1 : 0;
            break
    }
};
var _emscripten_glGetBooleanv = (name_, p) => emscriptenWebGLGet(name_, p, 4);
var _emscripten_glGetBufferParameteriv = (target, value, data) => {
    if (!data) {
        GL.recordError(1281);
        return
    }
    HEAP32[data >> 2] = GLctx.getBufferParameter(target, value)
};
var _emscripten_glGetError = () => {
    var error = GLctx.getError() || GL.lastError;
    GL.lastError = 0;
    return error
};
var _emscripten_glGetFloatv = (name_, p) => emscriptenWebGLGet(name_, p, 2);
var _emscripten_glGetFramebufferAttachmentParameteriv = (target, attachment, pname, params) => {
    var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
    if (result instanceof WebGLRenderbuffer || result instanceof WebGLTexture) {
        result = result.name | 0
    }
    HEAP32[params >> 2] = result
};
var _emscripten_glGetIntegerv = (name_, p) => emscriptenWebGLGet(name_, p, 0);
var _emscripten_glGetProgramInfoLog = (program, maxLength, length, infoLog) => {
    var log = GLctx.getProgramInfoLog(GL.programs[program]);
    if (log === null) log = "(unknown error)";
    var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
};
var _emscripten_glGetProgramiv = (program, pname, p) => {
    if (!p) {
        GL.recordError(1281);
        return
    }
    if (program >= GL.counter) {
        GL.recordError(1281);
        return
    }
    program = GL.programs[program];
    if (pname == 35716) {
        var log = GLctx.getProgramInfoLog(program);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1
    } else if (pname == 35719) {
        if (!program.maxUniformLength) {
            var numActiveUniforms = GLctx.getProgramParameter(program, 35718);
            for (var i = 0; i < numActiveUniforms; ++i) {
                program.maxUniformLength = Math.max(program.maxUniformLength, GLctx.getActiveUniform(program, i).name.length + 1)
            }
        }
        HEAP32[p >> 2] = program.maxUniformLength
    } else if (pname == 35722) {
        if (!program.maxAttributeLength) {
            var numActiveAttributes = GLctx.getProgramParameter(program, 35721);
            for (var i = 0; i < numActiveAttributes; ++i) {
                program.maxAttributeLength = Math.max(program.maxAttributeLength, GLctx.getActiveAttrib(program, i).name.length + 1)
            }
        }
        HEAP32[p >> 2] = program.maxAttributeLength
    } else if (pname == 35381) {
        if (!program.maxUniformBlockNameLength) {
            var numActiveUniformBlocks = GLctx.getProgramParameter(program, 35382);
            for (var i = 0; i < numActiveUniformBlocks; ++i) {
                program.maxUniformBlockNameLength = Math.max(program.maxUniformBlockNameLength, GLctx.getActiveUniformBlockName(program, i).length + 1)
            }
        }
        HEAP32[p >> 2] = program.maxUniformBlockNameLength
    } else {
        HEAP32[p >> 2] = GLctx.getProgramParameter(program, pname)
    }
};
var _emscripten_glGetQueryObjecti64vEXT = (id, pname, params) => {
    if (!params) {
        GL.recordError(1281);
        return
    }
    var query = GL.queries[id];
    var param;
    {
        param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname)
    }
    var ret;
    if (typeof param == "boolean") {
        ret = param ? 1 : 0
    } else {
        ret = param
    }
    writeI53ToI64(params, ret)
};
var _emscripten_glGetQueryObjectivEXT = (id, pname, params) => {
    if (!params) {
        GL.recordError(1281);
        return
    }
    var query = GL.queries[id];
    var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    var ret;
    if (typeof param == "boolean") {
        ret = param ? 1 : 0
    } else {
        ret = param
    }
    HEAP32[params >> 2] = ret
};
var _glGetQueryObjecti64vEXT = _emscripten_glGetQueryObjecti64vEXT;
var _emscripten_glGetQueryObjectui64vEXT = _glGetQueryObjecti64vEXT;
var _glGetQueryObjectivEXT = _emscripten_glGetQueryObjectivEXT;
var _emscripten_glGetQueryObjectuivEXT = _glGetQueryObjectivEXT;
var _emscripten_glGetQueryivEXT = (target, pname, params) => {
    if (!params) {
        GL.recordError(1281);
        return
    }
    HEAP32[params >> 2] = GLctx.disjointTimerQueryExt["getQueryEXT"](target, pname)
};
var _emscripten_glGetRenderbufferParameteriv = (target, pname, params) => {
    if (!params) {
        GL.recordError(1281);
        return
    }
    HEAP32[params >> 2] = GLctx.getRenderbufferParameter(target, pname)
};
var _emscripten_glGetShaderInfoLog = (shader, maxLength, length, infoLog) => {
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = "(unknown error)";
    var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
};
var _emscripten_glGetShaderPrecisionFormat = (shaderType, precisionType, range, precision) => {
    var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
    HEAP32[range >> 2] = result.rangeMin;
    HEAP32[range + 4 >> 2] = result.rangeMax;
    HEAP32[precision >> 2] = result.precision
};
var _emscripten_glGetShaderSource = (shader, bufSize, length, source) => {
    var result = GLctx.getShaderSource(GL.shaders[shader]);
    if (!result) return;
    var numBytesWrittenExclNull = bufSize > 0 && source ? stringToUTF8(result, source, bufSize) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
};
var _emscripten_glGetShaderiv = (shader, pname, p) => {
    if (!p) {
        GL.recordError(1281);
        return
    }
    if (pname == 35716) {
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = "(unknown error)";
        var logLength = log ? log.length + 1 : 0;
        HEAP32[p >> 2] = logLength
    } else if (pname == 35720) {
        var source = GLctx.getShaderSource(GL.shaders[shader]);
        var sourceLength = source ? source.length + 1 : 0;
        HEAP32[p >> 2] = sourceLength
    } else {
        HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname)
    }
};
var webglGetExtensions = () => {
    var exts = getEmscriptenSupportedExtensions(GLctx);
    exts = exts.concat(exts.map(e => "GL_" + e));
    return exts
};
var _emscripten_glGetString = name_ => {
    var ret = GL.stringCache[name_];
    if (!ret) {
        switch (name_) {
            case 7939:
                ret = stringToNewUTF8(webglGetExtensions().join(" "));
                break;
            case 7936:
            case 7937:
            case 37445:
            case 37446:
                var s = GLctx.getParameter(name_);
                if (!s) {
                    GL.recordError(1280)
                }
                ret = s ? stringToNewUTF8(s) : 0;
                break;
            case 7938:
                var webGLVersion = GLctx.getParameter(7938);
                var glVersion = `OpenGL ES 2.0 (${webGLVersion})`;
                ret = stringToNewUTF8(glVersion);
                break;
            case 35724:
                var glslVersion = GLctx.getParameter(35724);
                var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
                var ver_num = glslVersion.match(ver_re);
                if (ver_num !== null) {
                    if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0";
                    glslVersion = `OpenGL ES GLSL ES ${ver_num[1]} (${glslVersion})`
                }
                ret = stringToNewUTF8(glslVersion);
                break;
            default:
                GL.recordError(1280)
        }
        GL.stringCache[name_] = ret
    }
    return ret
};
var _emscripten_glGetTexParameterfv = (target, pname, params) => {
    if (!params) {
        GL.recordError(1281);
        return
    }
    HEAPF32[params >> 2] = GLctx.getTexParameter(target, pname)
};
var _emscripten_glGetTexParameteriv = (target, pname, params) => {
    if (!params) {
        GL.recordError(1281);
        return
    }
    HEAP32[params >> 2] = GLctx.getTexParameter(target, pname)
};
var jstoi_q = str => parseInt(str);
var webglGetLeftBracePos = name => name.slice(-1) == "]" && name.lastIndexOf("[");
var webglPrepareUniformLocationsBeforeFirstUse = program => {
    var uniformLocsById = program.uniformLocsById,
        uniformSizeAndIdsByName = program.uniformSizeAndIdsByName,
        i, j;
    if (!uniformLocsById) {
        program.uniformLocsById = uniformLocsById = {};
        program.uniformArrayNamesById = {};
        var numActiveUniforms = GLctx.getProgramParameter(program, 35718);
        for (i = 0; i < numActiveUniforms; ++i) {
            var u = GLctx.getActiveUniform(program, i);
            var nm = u.name;
            var sz = u.size;
            var lb = webglGetLeftBracePos(nm);
            var arrayName = lb > 0 ? nm.slice(0, lb) : nm;
            var id = program.uniformIdCounter;
            program.uniformIdCounter += sz;
            uniformSizeAndIdsByName[arrayName] = [sz, id];
            for (j = 0; j < sz; ++j) {
                uniformLocsById[id] = j;
                program.uniformArrayNamesById[id++] = arrayName
            }
        }
    }
};
var _emscripten_glGetUniformLocation = (program, name) => {
    name = UTF8ToString(name);
    if (program = GL.programs[program]) {
        webglPrepareUniformLocationsBeforeFirstUse(program);
        var uniformLocsById = program.uniformLocsById;
        var arrayIndex = 0;
        var uniformBaseName = name;
        var leftBrace = webglGetLeftBracePos(name);
        if (leftBrace > 0) {
            arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0;
            uniformBaseName = name.slice(0, leftBrace)
        }
        var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName];
        if (sizeAndId && arrayIndex < sizeAndId[0]) {
            arrayIndex += sizeAndId[1];
            if (uniformLocsById[arrayIndex] = uniformLocsById[arrayIndex] || GLctx.getUniformLocation(program, name)) {
                return arrayIndex
            }
        }
    } else {
        GL.recordError(1281)
    }
    return -1
};
var webglGetUniformLocation = location => {
    var p = GLctx.currentProgram;
    if (p) {
        var webglLoc = p.uniformLocsById[location];
        if (typeof webglLoc == "number") {
            p.uniformLocsById[location] = webglLoc = GLctx.getUniformLocation(p, p.uniformArrayNamesById[location] + (webglLoc > 0 ? `[${webglLoc}]` : ""))
        }
        return webglLoc
    } else {
        GL.recordError(1282)
    }
};
var emscriptenWebGLGetUniform = (program, location, params, type) => {
    if (!params) {
        GL.recordError(1281);
        return
    }
    program = GL.programs[program];
    webglPrepareUniformLocationsBeforeFirstUse(program);
    var data = GLctx.getUniform(program, webglGetUniformLocation(location));
    if (typeof data == "number" || typeof data == "boolean") {
        switch (type) {
            case 0:
                HEAP32[params >> 2] = data;
                break;
            case 2:
                HEAPF32[params >> 2] = data;
                break
        }
    } else {
        for (var i = 0; i < data.length; i++) {
            switch (type) {
                case 0:
                    HEAP32[params + i * 4 >> 2] = data[i];
                    break;
                case 2:
                    HEAPF32[params + i * 4 >> 2] = data[i];
                    break
            }
        }
    }
};
var _emscripten_glGetUniformfv = (program, location, params) => {
    emscriptenWebGLGetUniform(program, location, params, 2)
};
var _emscripten_glGetUniformiv = (program, location, params) => {
    emscriptenWebGLGetUniform(program, location, params, 0)
};
var _emscripten_glGetVertexAttribPointerv = (index, pname, pointer) => {
    if (!pointer) {
        GL.recordError(1281);
        return
    }
    HEAP32[pointer >> 2] = GLctx.getVertexAttribOffset(index, pname)
};
var emscriptenWebGLGetVertexAttrib = (index, pname, params, type) => {
    if (!params) {
        GL.recordError(1281);
        return
    }
    var data = GLctx.getVertexAttrib(index, pname);
    if (pname == 34975) {
        HEAP32[params >> 2] = data && data["name"]
    } else if (typeof data == "number" || typeof data == "boolean") {
        switch (type) {
            case 0:
                HEAP32[params >> 2] = data;
                break;
            case 2:
                HEAPF32[params >> 2] = data;
                break;
            case 5:
                HEAP32[params >> 2] = Math.fround(data);
                break
        }
    } else {
        for (var i = 0; i < data.length; i++) {
            switch (type) {
                case 0:
                    HEAP32[params + i * 4 >> 2] = data[i];
                    break;
                case 2:
                    HEAPF32[params + i * 4 >> 2] = data[i];
                    break;
                case 5:
                    HEAP32[params + i * 4 >> 2] = Math.fround(data[i]);
                    break
            }
        }
    }
};
var _emscripten_glGetVertexAttribfv = (index, pname, params) => {
    emscriptenWebGLGetVertexAttrib(index, pname, params, 2)
};
var _emscripten_glGetVertexAttribiv = (index, pname, params) => {
    emscriptenWebGLGetVertexAttrib(index, pname, params, 5)
};
var _emscripten_glHint = (x0, x1) => GLctx.hint(x0, x1);
var _emscripten_glIsBuffer = buffer => {
    var b = GL.buffers[buffer];
    if (!b) return 0;
    return GLctx.isBuffer(b)
};
var _emscripten_glIsEnabled = x0 => GLctx.isEnabled(x0);
var _emscripten_glIsFramebuffer = framebuffer => {
    var fb = GL.framebuffers[framebuffer];
    if (!fb) return 0;
    return GLctx.isFramebuffer(fb)
};
var _emscripten_glIsProgram = program => {
    program = GL.programs[program];
    if (!program) return 0;
    return GLctx.isProgram(program)
};
var _emscripten_glIsQueryEXT = id => {
    var query = GL.queries[id];
    if (!query) return 0;
    return GLctx.disjointTimerQueryExt["isQueryEXT"](query)
};
var _emscripten_glIsRenderbuffer = renderbuffer => {
    var rb = GL.renderbuffers[renderbuffer];
    if (!rb) return 0;
    return GLctx.isRenderbuffer(rb)
};
var _emscripten_glIsShader = shader => {
    var s = GL.shaders[shader];
    if (!s) return 0;
    return GLctx.isShader(s)
};
var _emscripten_glIsTexture = id => {
    var texture = GL.textures[id];
    if (!texture) return 0;
    return GLctx.isTexture(texture)
};
var _emscripten_glIsVertexArray = array => {
    var vao = GL.vaos[array];
    if (!vao) return 0;
    return GLctx.isVertexArray(vao)
};
var _glIsVertexArray = _emscripten_glIsVertexArray;
var _emscripten_glIsVertexArrayOES = _glIsVertexArray;
var _emscripten_glLineWidth = x0 => GLctx.lineWidth(x0);
var _emscripten_glLinkProgram = program => {
    program = GL.programs[program];
    GLctx.linkProgram(program);
    program.uniformLocsById = 0;
    program.uniformSizeAndIdsByName = {}
};
var _emscripten_glPixelStorei = (pname, param) => {
    if (pname == 3317) {
        GL.unpackAlignment = param
    } else if (pname == 3314) {
        GL.unpackRowLength = param
    }
    GLctx.pixelStorei(pname, param)
};
var _emscripten_glPolygonModeWEBGL = (face, mode) => {
    GLctx.webglPolygonMode["polygonModeWEBGL"](face, mode)
};
var _emscripten_glPolygonOffset = (x0, x1) => GLctx.polygonOffset(x0, x1);
var _emscripten_glPolygonOffsetClampEXT = (factor, units, clamp) => {
    GLctx.extPolygonOffsetClamp["polygonOffsetClampEXT"](factor, units, clamp)
};
var _emscripten_glQueryCounterEXT = (id, target) => {
    GLctx.disjointTimerQueryExt["queryCounterEXT"](GL.queries[id], target)
};
var computeUnpackAlignedImageSize = (width, height, sizePerPixel) => {
    function roundedToNextMultipleOf(x, y) {
        return x + y - 1 & -y
    }
    var plainRowSize = (GL.unpackRowLength || width) * sizePerPixel;
    var alignedRowSize = roundedToNextMultipleOf(plainRowSize, GL.unpackAlignment);
    return height * alignedRowSize
};
var colorChannelsInGlTextureFormat = format => {
    var colorChannels = {
        5: 3,
        6: 4,
        8: 2,
        29502: 3,
        29504: 4
    };
    return colorChannels[format - 6402] || 1
};
var heapObjectForWebGLType = type => {
    type -= 5120;
    if (type == 1) return HEAPU8;
    if (type == 4) return HEAP32;
    if (type == 6) return HEAPF32;
    if (type == 5 || type == 28922) return HEAPU32;
    return HEAPU16
};
var toTypedArrayIndex = (pointer, heap) => pointer >>> 31 - Math.clz32(heap.BYTES_PER_ELEMENT);
var emscriptenWebGLGetTexPixelData = (type, format, width, height, pixels, internalFormat) => {
    var heap = heapObjectForWebGLType(type);
    var sizePerPixel = colorChannelsInGlTextureFormat(format) * heap.BYTES_PER_ELEMENT;
    var bytes = computeUnpackAlignedImageSize(width, height, sizePerPixel);
    return heap.subarray(toTypedArrayIndex(pixels, heap), toTypedArrayIndex(pixels + bytes, heap))
};
var _emscripten_glReadPixels = (x, y, width, height, format, type, pixels) => {
    var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
    if (!pixelData) {
        GL.recordError(1280);
        return
    }
    GLctx.readPixels(x, y, width, height, format, type, pixelData)
};
var _emscripten_glReleaseShaderCompiler = () => {};
var _emscripten_glRenderbufferStorage = (x0, x1, x2, x3) => GLctx.renderbufferStorage(x0, x1, x2, x3);
var _emscripten_glSampleCoverage = (value, invert) => {
    GLctx.sampleCoverage(value, !!invert)
};
var _emscripten_glScissor = (x0, x1, x2, x3) => GLctx.scissor(x0, x1, x2, x3);
var _emscripten_glShaderBinary = (count, shaders, binaryformat, binary, length) => {
    GL.recordError(1280)
};
var _emscripten_glShaderSource = (shader, count, string, length) => {
    var source = GL.getSource(shader, count, string, length);
    GLctx.shaderSource(GL.shaders[shader], source)
};
var _emscripten_glStencilFunc = (x0, x1, x2) => GLctx.stencilFunc(x0, x1, x2);
var _emscripten_glStencilFuncSeparate = (x0, x1, x2, x3) => GLctx.stencilFuncSeparate(x0, x1, x2, x3);
var _emscripten_glStencilMask = x0 => GLctx.stencilMask(x0);
var _emscripten_glStencilMaskSeparate = (x0, x1) => GLctx.stencilMaskSeparate(x0, x1);
var _emscripten_glStencilOp = (x0, x1, x2) => GLctx.stencilOp(x0, x1, x2);
var _emscripten_glStencilOpSeparate = (x0, x1, x2, x3) => GLctx.stencilOpSeparate(x0, x1, x2, x3);
var _emscripten_glTexImage2D = (target, level, internalFormat, width, height, border, format, type, pixels) => {
    var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null;
    GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixelData)
};
var _emscripten_glTexParameterf = (x0, x1, x2) => GLctx.texParameterf(x0, x1, x2);
var _emscripten_glTexParameterfv = (target, pname, params) => {
    var param = HEAPF32[params >> 2];
    GLctx.texParameterf(target, pname, param)
};
var _emscripten_glTexParameteri = (x0, x1, x2) => GLctx.texParameteri(x0, x1, x2);
var _emscripten_glTexParameteriv = (target, pname, params) => {
    var param = HEAP32[params >> 2];
    GLctx.texParameteri(target, pname, param)
};
var _emscripten_glTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, type, pixels) => {
    var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0) : null;
    GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData)
};
var _emscripten_glUniform1f = (location, v0) => {
    GLctx.uniform1f(webglGetUniformLocation(location), v0)
};
var miniTempWebGLFloatBuffers = [];
var _emscripten_glUniform1fv = (location, count, value) => {
    if (count <= 288) {
        var view = miniTempWebGLFloatBuffers[count];
        for (var i = 0; i < count; ++i) {
            view[i] = HEAPF32[value + 4 * i >> 2]
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, value + count * 4 >> 2)
    }
    GLctx.uniform1fv(webglGetUniformLocation(location), view)
};
var _emscripten_glUniform1i = (location, v0) => {
    GLctx.uniform1i(webglGetUniformLocation(location), v0)
};
var miniTempWebGLIntBuffers = [];
var _emscripten_glUniform1iv = (location, count, value) => {
    if (count <= 288) {
        var view = miniTempWebGLIntBuffers[count];
        for (var i = 0; i < count; ++i) {
            view[i] = HEAP32[value + 4 * i >> 2]
        }
    } else {
        var view = HEAP32.subarray(value >> 2, value + count * 4 >> 2)
    }
    GLctx.uniform1iv(webglGetUniformLocation(location), view)
};
var _emscripten_glUniform2f = (location, v0, v1) => {
    GLctx.uniform2f(webglGetUniformLocation(location), v0, v1)
};
var _emscripten_glUniform2fv = (location, count, value) => {
    if (count <= 144) {
        count *= 2;
        var view = miniTempWebGLFloatBuffers[count];
        for (var i = 0; i < count; i += 2) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2]
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, value + count * 8 >> 2)
    }
    GLctx.uniform2fv(webglGetUniformLocation(location), view)
};
var _emscripten_glUniform2i = (location, v0, v1) => {
    GLctx.uniform2i(webglGetUniformLocation(location), v0, v1)
};
var _emscripten_glUniform2iv = (location, count, value) => {
    if (count <= 144) {
        count *= 2;
        var view = miniTempWebGLIntBuffers[count];
        for (var i = 0; i < count; i += 2) {
            view[i] = HEAP32[value + 4 * i >> 2];
            view[i + 1] = HEAP32[value + (4 * i + 4) >> 2]
        }
    } else {
        var view = HEAP32.subarray(value >> 2, value + count * 8 >> 2)
    }
    GLctx.uniform2iv(webglGetUniformLocation(location), view)
};
var _emscripten_glUniform3f = (location, v0, v1, v2) => {
    GLctx.uniform3f(webglGetUniformLocation(location), v0, v1, v2)
};
var _emscripten_glUniform3fv = (location, count, value) => {
    if (count <= 96) {
        count *= 3;
        var view = miniTempWebGLFloatBuffers[count];
        for (var i = 0; i < count; i += 3) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2]
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, value + count * 12 >> 2)
    }
    GLctx.uniform3fv(webglGetUniformLocation(location), view)
};
var _emscripten_glUniform3i = (location, v0, v1, v2) => {
    GLctx.uniform3i(webglGetUniformLocation(location), v0, v1, v2)
};
var _emscripten_glUniform3iv = (location, count, value) => {
    if (count <= 96) {
        count *= 3;
        var view = miniTempWebGLIntBuffers[count];
        for (var i = 0; i < count; i += 3) {
            view[i] = HEAP32[value + 4 * i >> 2];
            view[i + 1] = HEAP32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAP32[value + (4 * i + 8) >> 2]
        }
    } else {
        var view = HEAP32.subarray(value >> 2, value + count * 12 >> 2)
    }
    GLctx.uniform3iv(webglGetUniformLocation(location), view)
};
var _emscripten_glUniform4f = (location, v0, v1, v2, v3) => {
    GLctx.uniform4f(webglGetUniformLocation(location), v0, v1, v2, v3)
};
var _emscripten_glUniform4fv = (location, count, value) => {
    if (count <= 72) {
        var view = miniTempWebGLFloatBuffers[4 * count];
        var heap = HEAPF32;
        value = value >> 2;
        count *= 4;
        for (var i = 0; i < count; i += 4) {
            var dst = value + i;
            view[i] = heap[dst];
            view[i + 1] = heap[dst + 1];
            view[i + 2] = heap[dst + 2];
            view[i + 3] = heap[dst + 3]
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2)
    }
    GLctx.uniform4fv(webglGetUniformLocation(location), view)
};
var _emscripten_glUniform4i = (location, v0, v1, v2, v3) => {
    GLctx.uniform4i(webglGetUniformLocation(location), v0, v1, v2, v3)
};
var _emscripten_glUniform4iv = (location, count, value) => {
    if (count <= 72) {
        count *= 4;
        var view = miniTempWebGLIntBuffers[count];
        for (var i = 0; i < count; i += 4) {
            view[i] = HEAP32[value + 4 * i >> 2];
            view[i + 1] = HEAP32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAP32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAP32[value + (4 * i + 12) >> 2]
        }
    } else {
        var view = HEAP32.subarray(value >> 2, value + count * 16 >> 2)
    }
    GLctx.uniform4iv(webglGetUniformLocation(location), view)
};
var _emscripten_glUniformMatrix2fv = (location, count, transpose, value) => {
    if (count <= 72) {
        count *= 4;
        var view = miniTempWebGLFloatBuffers[count];
        for (var i = 0; i < count; i += 4) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2]
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2)
    }
    GLctx.uniformMatrix2fv(webglGetUniformLocation(location), !!transpose, view)
};
var _emscripten_glUniformMatrix3fv = (location, count, transpose, value) => {
    if (count <= 32) {
        count *= 9;
        var view = miniTempWebGLFloatBuffers[count];
        for (var i = 0; i < count; i += 9) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2];
            view[i + 4] = HEAPF32[value + (4 * i + 16) >> 2];
            view[i + 5] = HEAPF32[value + (4 * i + 20) >> 2];
            view[i + 6] = HEAPF32[value + (4 * i + 24) >> 2];
            view[i + 7] = HEAPF32[value + (4 * i + 28) >> 2];
            view[i + 8] = HEAPF32[value + (4 * i + 32) >> 2]
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, value + count * 36 >> 2)
    }
    GLctx.uniformMatrix3fv(webglGetUniformLocation(location), !!transpose, view)
};
var _emscripten_glUniformMatrix4fv = (location, count, transpose, value) => {
    if (count <= 18) {
        var view = miniTempWebGLFloatBuffers[16 * count];
        var heap = HEAPF32;
        value = value >> 2;
        count *= 16;
        for (var i = 0; i < count; i += 16) {
            var dst = value + i;
            view[i] = heap[dst];
            view[i + 1] = heap[dst + 1];
            view[i + 2] = heap[dst + 2];
            view[i + 3] = heap[dst + 3];
            view[i + 4] = heap[dst + 4];
            view[i + 5] = heap[dst + 5];
            view[i + 6] = heap[dst + 6];
            view[i + 7] = heap[dst + 7];
            view[i + 8] = heap[dst + 8];
            view[i + 9] = heap[dst + 9];
            view[i + 10] = heap[dst + 10];
            view[i + 11] = heap[dst + 11];
            view[i + 12] = heap[dst + 12];
            view[i + 13] = heap[dst + 13];
            view[i + 14] = heap[dst + 14];
            view[i + 15] = heap[dst + 15]
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, value + count * 64 >> 2)
    }
    GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, view)
};
var _emscripten_glUseProgram = program => {
    program = GL.programs[program];
    GLctx.useProgram(program);
    GLctx.currentProgram = program
};
var _emscripten_glValidateProgram = program => {
    GLctx.validateProgram(GL.programs[program])
};
var _emscripten_glVertexAttrib1f = (x0, x1) => GLctx.vertexAttrib1f(x0, x1);
var _emscripten_glVertexAttrib1fv = (index, v) => {
    GLctx.vertexAttrib1f(index, HEAPF32[v >> 2])
};
var _emscripten_glVertexAttrib2f = (x0, x1, x2) => GLctx.vertexAttrib2f(x0, x1, x2);
var _emscripten_glVertexAttrib2fv = (index, v) => {
    GLctx.vertexAttrib2f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2])
};
var _emscripten_glVertexAttrib3f = (x0, x1, x2, x3) => GLctx.vertexAttrib3f(x0, x1, x2, x3);
var _emscripten_glVertexAttrib3fv = (index, v) => {
    GLctx.vertexAttrib3f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2])
};
var _emscripten_glVertexAttrib4f = (x0, x1, x2, x3, x4) => GLctx.vertexAttrib4f(x0, x1, x2, x3, x4);
var _emscripten_glVertexAttrib4fv = (index, v) => {
    GLctx.vertexAttrib4f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2], HEAPF32[v + 12 >> 2])
};
var _emscripten_glVertexAttribDivisor = (index, divisor) => {
    GLctx.vertexAttribDivisor(index, divisor)
};
var _glVertexAttribDivisor = _emscripten_glVertexAttribDivisor;
var _emscripten_glVertexAttribDivisorANGLE = _glVertexAttribDivisor;
var _emscripten_glVertexAttribPointer = (index, size, type, normalized, stride, ptr) => {
    GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr)
};
var _emscripten_glViewport = (x0, x1, x2, x3) => GLctx.viewport(x0, x1, x2, x3);
var _emscripten_has_asyncify = () => 0;
var doRequestFullscreen = (target, strategy) => {
    if (!JSEvents.fullscreenEnabled()) return -1;
    target = findEventTarget(target);
    if (!target) return -4;
    if (!target.requestFullscreen && !target.webkitRequestFullscreen) {
        return -3
    }
    if (!JSEvents.canPerformEventHandlerRequests()) {
        if (strategy.deferUntilInEventHandler) {
            JSEvents.deferCall(JSEvents_requestFullscreen, 1, [target, strategy]);
            return 1
        }
        return -2
    }
    return JSEvents_requestFullscreen(target, strategy)
};
var _emscripten_request_fullscreen_strategy = (target, deferUntilInEventHandler, fullscreenStrategy) => {
    var strategy = {
        scaleMode: HEAP32[fullscreenStrategy >> 2],
        canvasResolutionScaleMode: HEAP32[fullscreenStrategy + 4 >> 2],
        filteringMode: HEAP32[fullscreenStrategy + 8 >> 2],
        deferUntilInEventHandler,
        canvasResizedCallback: HEAP32[fullscreenStrategy + 12 >> 2],
        canvasResizedCallbackUserData: HEAP32[fullscreenStrategy + 16 >> 2]
    };
    return doRequestFullscreen(target, strategy)
};
var _emscripten_request_pointerlock = (target, deferUntilInEventHandler) => {
    target = findEventTarget(target);
    if (!target) return -4;
    if (!target.requestPointerLock) {
        return -1
    }
    if (!JSEvents.canPerformEventHandlerRequests()) {
        if (deferUntilInEventHandler) {
            JSEvents.deferCall(requestPointerLock, 2, [target]);
            return 1
        }
        return -2
    }
    return requestPointerLock(target)
};
var growMemory = size => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
        wasmMemory.grow(pages);
        updateMemoryViews();
        return 1
    } catch (e) {}
};
var _emscripten_resize_heap = requestedSize => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
        return false
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 1 / cutDown);
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
        var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
        var replacement = growMemory(newSize);
        if (replacement) {
            return true
        }
    }
    return false
};
var _emscripten_sample_gamepad_data = () => {
    try {
        if (navigator.getGamepads) return (JSEvents.lastGamepadState = navigator.getGamepads()) ? 0 : -1
    } catch (e) {
        navigator.getGamepads = null
    }
    return -1
};
var registerBeforeUnloadEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) => {
    var beforeUnloadEventHandlerFunc = e => {
        var confirmationMessage = getWasmTableEntry(callbackfunc)(eventTypeId, 0, userData);
        if (confirmationMessage) {
            confirmationMessage = UTF8ToString(confirmationMessage)
        }
        if (confirmationMessage) {
            e.preventDefault();
            e.returnValue = confirmationMessage;
            return confirmationMessage
        }
    };
    var eventHandler = {
        target: findEventTarget(target),
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: beforeUnloadEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_beforeunload_callback_on_thread = (userData, callbackfunc, targetThread) => {
    if (typeof onbeforeunload == "undefined") return -1;
    if (targetThread !== 1) return -5;
    return registerBeforeUnloadEventCallback(2, userData, true, callbackfunc, 28, "beforeunload")
};
var registerFocusEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 256;
    JSEvents.focusEvent ||= _malloc(eventSize);
    var focusEventHandlerFunc = e => {
        var nodeName = JSEvents.getNodeNameForTarget(e.target);
        var id = e.target.id ? e.target.id : "";
        var focusEvent = JSEvents.focusEvent;
        stringToUTF8(nodeName, focusEvent + 0, 128);
        stringToUTF8(id, focusEvent + 128, 128);
        if (getWasmTableEntry(callbackfunc)(eventTypeId, focusEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target: findEventTarget(target),
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: focusEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_blur_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerFocusEventCallback(target, userData, useCapture, callbackfunc, 12, "blur", targetThread);
var _emscripten_set_element_css_size = (target, width, height) => {
    target = findEventTarget(target);
    if (!target) return -4;
    target.style.width = width + "px";
    target.style.height = height + "px";
    return 0
};
var _emscripten_set_focus_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerFocusEventCallback(target, userData, useCapture, callbackfunc, 13, "focus", targetThread);
var fillFullscreenChangeEventData = eventStruct => {
    var fullscreenElement = getFullscreenElement();
    var isFullscreen = !!fullscreenElement;
    HEAP8[eventStruct] = isFullscreen;
    HEAP8[eventStruct + 1] = JSEvents.fullscreenEnabled();
    var reportedElement = isFullscreen ? fullscreenElement : JSEvents.previousFullscreenElement;
    var nodeName = JSEvents.getNodeNameForTarget(reportedElement);
    var id = reportedElement?.id || "";
    stringToUTF8(nodeName, eventStruct + 2, 128);
    stringToUTF8(id, eventStruct + 130, 128);
    HEAP32[eventStruct + 260 >> 2] = reportedElement ? reportedElement.clientWidth : 0;
    HEAP32[eventStruct + 264 >> 2] = reportedElement ? reportedElement.clientHeight : 0;
    HEAP32[eventStruct + 268 >> 2] = screen.width;
    HEAP32[eventStruct + 272 >> 2] = screen.height;
    if (isFullscreen) {
        JSEvents.previousFullscreenElement = fullscreenElement
    }
};
var registerFullscreenChangeEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 276;
    JSEvents.fullscreenChangeEvent ||= _malloc(eventSize);
    var fullscreenChangeEventhandlerFunc = e => {
        var fullscreenChangeEvent = JSEvents.fullscreenChangeEvent;
        fillFullscreenChangeEventData(fullscreenChangeEvent);
        if (getWasmTableEntry(callbackfunc)(eventTypeId, fullscreenChangeEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target,
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: fullscreenChangeEventhandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_fullscreenchange_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
    if (!JSEvents.fullscreenEnabled()) return -1;
    target = findEventTarget(target);
    if (!target) return -4;
    registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "webkitfullscreenchange", targetThread);
    return registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "fullscreenchange", targetThread)
};
var registerGamepadEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 1240;
    JSEvents.gamepadEvent ||= _malloc(eventSize);
    var gamepadEventHandlerFunc = e => {
        var gamepadEvent = JSEvents.gamepadEvent;
        fillGamepadEventData(gamepadEvent, e["gamepad"]);
        if (getWasmTableEntry(callbackfunc)(eventTypeId, gamepadEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target: findEventTarget(target),
        allowsDeferredCalls: true,
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: gamepadEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_gamepadconnected_callback_on_thread = (userData, useCapture, callbackfunc, targetThread) => {
    if (_emscripten_sample_gamepad_data()) return -1;
    return registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 26, "gamepadconnected", targetThread)
};
var _emscripten_set_gamepaddisconnected_callback_on_thread = (userData, useCapture, callbackfunc, targetThread) => {
    if (_emscripten_sample_gamepad_data()) return -1;
    return registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 27, "gamepaddisconnected", targetThread)
};
var registerKeyEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 160;
    JSEvents.keyEvent ||= _malloc(eventSize);
    var keyEventHandlerFunc = e => {
        var keyEventData = JSEvents.keyEvent;
        HEAPF64[keyEventData >> 3] = e.timeStamp;
        var idx = keyEventData >> 2;
        HEAP32[idx + 2] = e.location;
        HEAP8[keyEventData + 12] = e.ctrlKey;
        HEAP8[keyEventData + 13] = e.shiftKey;
        HEAP8[keyEventData + 14] = e.altKey;
        HEAP8[keyEventData + 15] = e.metaKey;
        HEAP8[keyEventData + 16] = e.repeat;
        HEAP32[idx + 5] = e.charCode;
        HEAP32[idx + 6] = e.keyCode;
        HEAP32[idx + 7] = e.which;
        stringToUTF8(e.key || "", keyEventData + 32, 32);
        stringToUTF8(e.code || "", keyEventData + 64, 32);
        stringToUTF8(e.char || "", keyEventData + 96, 32);
        stringToUTF8(e.locale || "", keyEventData + 128, 32);
        if (getWasmTableEntry(callbackfunc)(eventTypeId, keyEventData, userData)) e.preventDefault()
    };
    var eventHandler = {
        target: findEventTarget(target),
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: keyEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_keydown_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerKeyEventCallback(target, userData, useCapture, callbackfunc, 2, "keydown", targetThread);
var _emscripten_set_keypress_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerKeyEventCallback(target, userData, useCapture, callbackfunc, 1, "keypress", targetThread);
var _emscripten_set_keyup_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerKeyEventCallback(target, userData, useCapture, callbackfunc, 3, "keyup", targetThread);
var _emscripten_set_main_loop = (func, fps, simulateInfiniteLoop) => {
    var iterFunc = getWasmTableEntry(func);
    setMainLoop(iterFunc, fps, simulateInfiniteLoop)
};
var fillMouseEventData = (eventStruct, e, target) => {
    HEAPF64[eventStruct >> 3] = e.timeStamp;
    var idx = eventStruct >> 2;
    HEAP32[idx + 2] = e.screenX;
    HEAP32[idx + 3] = e.screenY;
    HEAP32[idx + 4] = e.clientX;
    HEAP32[idx + 5] = e.clientY;
    HEAP8[eventStruct + 24] = e.ctrlKey;
    HEAP8[eventStruct + 25] = e.shiftKey;
    HEAP8[eventStruct + 26] = e.altKey;
    HEAP8[eventStruct + 27] = e.metaKey;
    HEAP16[idx * 2 + 14] = e.button;
    HEAP16[idx * 2 + 15] = e.buttons;
    HEAP32[idx + 8] = e["movementX"];
    HEAP32[idx + 9] = e["movementY"];
    var rect = getBoundingClientRect(target);
    HEAP32[idx + 10] = e.clientX - (rect.left | 0);
    HEAP32[idx + 11] = e.clientY - (rect.top | 0)
};
var registerMouseEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 64;
    JSEvents.mouseEvent ||= _malloc(eventSize);
    target = findEventTarget(target);
    var mouseEventHandlerFunc = e => {
        fillMouseEventData(JSEvents.mouseEvent, e, target);
        if (getWasmTableEntry(callbackfunc)(eventTypeId, JSEvents.mouseEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target,
        allowsDeferredCalls: eventTypeString != "mousemove" && eventTypeString != "mouseenter" && eventTypeString != "mouseleave",
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: mouseEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_mousedown_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerMouseEventCallback(target, userData, useCapture, callbackfunc, 5, "mousedown", targetThread);
var _emscripten_set_mouseenter_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerMouseEventCallback(target, userData, useCapture, callbackfunc, 33, "mouseenter", targetThread);
var _emscripten_set_mouseleave_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerMouseEventCallback(target, userData, useCapture, callbackfunc, 34, "mouseleave", targetThread);
var _emscripten_set_mousemove_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerMouseEventCallback(target, userData, useCapture, callbackfunc, 8, "mousemove", targetThread);
var _emscripten_set_mouseup_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerMouseEventCallback(target, userData, useCapture, callbackfunc, 6, "mouseup", targetThread);
var fillPointerlockChangeEventData = eventStruct => {
    var pointerLockElement = document.pointerLockElement;
    var isPointerlocked = !!pointerLockElement;
    HEAP8[eventStruct] = isPointerlocked;
    var nodeName = JSEvents.getNodeNameForTarget(pointerLockElement);
    var id = pointerLockElement?.id || "";
    stringToUTF8(nodeName, eventStruct + 1, 128);
    stringToUTF8(id, eventStruct + 129, 128)
};
var registerPointerlockChangeEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 257;
    JSEvents.pointerlockChangeEvent ||= _malloc(eventSize);
    var pointerlockChangeEventHandlerFunc = e => {
        var pointerlockChangeEvent = JSEvents.pointerlockChangeEvent;
        fillPointerlockChangeEventData(pointerlockChangeEvent);
        if (getWasmTableEntry(callbackfunc)(eventTypeId, pointerlockChangeEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target,
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: pointerlockChangeEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_pointerlockchange_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
    if (!document.body?.requestPointerLock) {
        return -1
    }
    target = findEventTarget(target);
    if (!target) return -4;
    return registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "pointerlockchange", targetThread)
};
var registerUiEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 36;
    JSEvents.uiEvent ||= _malloc(eventSize);
    target = findEventTarget(target);
    var uiEventHandlerFunc = e => {
        if (e.target != target) {
            return
        }
        var b = document.body;
        if (!b) {
            return
        }
        var uiEvent = JSEvents.uiEvent;
        HEAP32[uiEvent >> 2] = 0;
        HEAP32[uiEvent + 4 >> 2] = b.clientWidth;
        HEAP32[uiEvent + 8 >> 2] = b.clientHeight;
        HEAP32[uiEvent + 12 >> 2] = innerWidth;
        HEAP32[uiEvent + 16 >> 2] = innerHeight;
        HEAP32[uiEvent + 20 >> 2] = outerWidth;
        HEAP32[uiEvent + 24 >> 2] = outerHeight;
        HEAP32[uiEvent + 28 >> 2] = pageXOffset | 0;
        HEAP32[uiEvent + 32 >> 2] = pageYOffset | 0;
        if (getWasmTableEntry(callbackfunc)(eventTypeId, uiEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target,
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: uiEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_resize_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerUiEventCallback(target, userData, useCapture, callbackfunc, 10, "resize", targetThread);
var _emscripten_set_timeout = (cb, msecs, userData) => safeSetTimeout(() => getWasmTableEntry(cb)(userData), msecs);
var registerTouchEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 1552;
    JSEvents.touchEvent ||= _malloc(eventSize);
    target = findEventTarget(target);
    var touchEventHandlerFunc = e => {
        var t, touches = {},
            et = e.touches;
        for (let t of et) {
            t.isChanged = t.onTarget = 0;
            touches[t.identifier] = t
        }
        for (let t of e.changedTouches) {
            t.isChanged = 1;
            touches[t.identifier] = t
        }
        for (let t of e.targetTouches) {
            touches[t.identifier].onTarget = 1
        }
        var touchEvent = JSEvents.touchEvent;
        HEAPF64[touchEvent >> 3] = e.timeStamp;
        HEAP8[touchEvent + 12] = e.ctrlKey;
        HEAP8[touchEvent + 13] = e.shiftKey;
        HEAP8[touchEvent + 14] = e.altKey;
        HEAP8[touchEvent + 15] = e.metaKey;
        var idx = touchEvent + 16;
        var targetRect = getBoundingClientRect(target);
        var numTouches = 0;
        for (let t of Object.values(touches)) {
            var idx32 = idx >> 2;
            HEAP32[idx32 + 0] = t.identifier;
            HEAP32[idx32 + 1] = t.screenX;
            HEAP32[idx32 + 2] = t.screenY;
            HEAP32[idx32 + 3] = t.clientX;
            HEAP32[idx32 + 4] = t.clientY;
            HEAP32[idx32 + 5] = t.pageX;
            HEAP32[idx32 + 6] = t.pageY;
            HEAP8[idx + 28] = t.isChanged;
            HEAP8[idx + 29] = t.onTarget;
            HEAP32[idx32 + 8] = t.clientX - (targetRect.left | 0);
            HEAP32[idx32 + 9] = t.clientY - (targetRect.top | 0);
            idx += 48;
            if (++numTouches > 31) {
                break
            }
        }
        HEAP32[touchEvent + 8 >> 2] = numTouches;
        if (getWasmTableEntry(callbackfunc)(eventTypeId, touchEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target,
        allowsDeferredCalls: eventTypeString == "touchstart" || eventTypeString == "touchend",
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: touchEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_touchcancel_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerTouchEventCallback(target, userData, useCapture, callbackfunc, 25, "touchcancel", targetThread);
var _emscripten_set_touchend_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerTouchEventCallback(target, userData, useCapture, callbackfunc, 23, "touchend", targetThread);
var _emscripten_set_touchmove_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerTouchEventCallback(target, userData, useCapture, callbackfunc, 24, "touchmove", targetThread);
var _emscripten_set_touchstart_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => registerTouchEventCallback(target, userData, useCapture, callbackfunc, 22, "touchstart", targetThread);
var fillVisibilityChangeEventData = eventStruct => {
    var visibilityStates = ["hidden", "visible", "prerender", "unloaded"];
    var visibilityState = visibilityStates.indexOf(document.visibilityState);
    HEAP8[eventStruct] = document.hidden;
    HEAP32[eventStruct + 4 >> 2] = visibilityState
};
var registerVisibilityChangeEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 8;
    JSEvents.visibilityChangeEvent ||= _malloc(eventSize);
    var visibilityChangeEventHandlerFunc = e => {
        var visibilityChangeEvent = JSEvents.visibilityChangeEvent;
        fillVisibilityChangeEventData(visibilityChangeEvent);
        if (getWasmTableEntry(callbackfunc)(eventTypeId, visibilityChangeEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target,
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: visibilityChangeEventHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_visibilitychange_callback_on_thread = (userData, useCapture, callbackfunc, targetThread) => {
    if (!specialHTMLTargets[1]) {
        return -4
    }
    return registerVisibilityChangeEventCallback(specialHTMLTargets[1], userData, useCapture, callbackfunc, 21, "visibilitychange", targetThread)
};
var registerWheelEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
    var eventSize = 96;
    JSEvents.wheelEvent ||= _malloc(eventSize);
    var wheelHandlerFunc = e => {
        var wheelEvent = JSEvents.wheelEvent;
        fillMouseEventData(wheelEvent, e, target);
        HEAPF64[wheelEvent + 64 >> 3] = e["deltaX"];
        HEAPF64[wheelEvent + 72 >> 3] = e["deltaY"];
        HEAPF64[wheelEvent + 80 >> 3] = e["deltaZ"];
        HEAP32[wheelEvent + 88 >> 2] = e["deltaMode"];
        if (getWasmTableEntry(callbackfunc)(eventTypeId, wheelEvent, userData)) e.preventDefault()
    };
    var eventHandler = {
        target,
        allowsDeferredCalls: true,
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: wheelHandlerFunc,
        useCapture
    };
    return JSEvents.registerOrRemoveHandler(eventHandler)
};
var _emscripten_set_wheel_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
    target = findEventTarget(target);
    if (!target) return -4;
    if (typeof target.onwheel != "undefined") {
        return registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "wheel", targetThread)
    } else {
        return -1
    }
};
var _emscripten_set_window_title = title => document.title = UTF8ToString(title);
var _emscripten_sleep = () => {
    abort("Please compile your program with async support in order to use asynchronous operations like emscripten_sleep")
};
var ENV = {};
var getEnvStrings = () => {
    if (!getEnvStrings.strings) {
        var lang = (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8";
        var env = {
            USER: "web_user",
            LOGNAME: "web_user",
            PATH: "/",
            PWD: "/",
            HOME: "/home/web_user",
            LANG: lang,
            _: getExecutableName()
        };
        for (var x in ENV) {
            if (ENV[x] === undefined) delete env[x];
            else env[x] = ENV[x]
        }
        var strings = [];
        for (var x in env) {
            strings.push(`${x}=${env[x]}`)
        }
        getEnvStrings.strings = strings
    }
    return getEnvStrings.strings
};
var _environ_get = (__environ, environ_buf) => {
    var bufSize = 0;
    var envp = 0;
    for (var string of getEnvStrings()) {
        var ptr = environ_buf + bufSize;
        HEAPU32[__environ + envp >> 2] = ptr;
        bufSize += stringToUTF8(string, ptr, Infinity) + 1;
        envp += 4
    }
    return 0
};
var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
    var strings = getEnvStrings();
    HEAPU32[penviron_count >> 2] = strings.length;
    var bufSize = 0;
    for (var string of strings) {
        bufSize += lengthBytesUTF8(string) + 1
    }
    HEAPU32[penviron_buf_size >> 2] = bufSize;
    return 0
};

function _fd_close(fd) {
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        FS.close(stream);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno
    }
}

function _fd_fdstat_get(fd, pbuf) {
    try {
        var rightsBase = 0;
        var rightsInheriting = 0;
        var flags = 0;
        {
            var stream = SYSCALLS.getStreamFromFD(fd);
            var type = stream.tty ? 2 : FS.isDir(stream.mode) ? 3 : FS.isLink(stream.mode) ? 7 : 4
        }
        HEAP8[pbuf] = type;
        HEAP16[pbuf + 2 >> 1] = flags;
        HEAP64[pbuf + 8 >> 3] = BigInt(rightsBase);
        HEAP64[pbuf + 16 >> 3] = BigInt(rightsInheriting);
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno
    }
}
var doReadv = (stream, iov, iovcnt, offset) => {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[iov >> 2];
        var len = HEAPU32[iov + 4 >> 2];
        iov += 8;
        var curr = FS.read(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break;
        if (typeof offset != "undefined") {
            offset += curr
        }
    }
    return ret
};

function _fd_read(fd, iov, iovcnt, pnum) {
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = doReadv(stream, iov, iovcnt);
        HEAPU32[pnum >> 2] = num;
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno
    }
}

function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
    try {
        if (isNaN(offset)) return 61;
        var stream = SYSCALLS.getStreamFromFD(fd);
        FS.llseek(stream, offset, whence);
        HEAP64[newOffset >> 3] = BigInt(stream.position);
        if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno
    }
}
var doWritev = (stream, iov, iovcnt, offset) => {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[iov >> 2];
        var len = HEAPU32[iov + 4 >> 2];
        iov += 8;
        var curr = FS.write(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) {
            break
        }
        if (typeof offset != "undefined") {
            offset += curr
        }
    }
    return ret
};

function _fd_write(fd, iov, iovcnt, pnum) {
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = doWritev(stream, iov, iovcnt);
        HEAPU32[pnum >> 2] = num;
        return 0
    } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno
    }
}
var _getaddrinfo = (node, service, hint, out) => {
    var addr = 0;
    var port = 0;
    var flags = 0;
    var family = 0;
    var type = 0;
    var proto = 0;
    var ai;

    function allocaddrinfo(family, type, proto, canon, addr, port) {
        var sa, salen, ai;
        var errno;
        salen = family === 10 ? 28 : 16;
        addr = family === 10 ? inetNtop6(addr) : inetNtop4(addr);
        sa = _malloc(salen);
        errno = writeSockaddr(sa, family, addr, port);
        ai = _malloc(32);
        HEAP32[ai + 4 >> 2] = family;
        HEAP32[ai + 8 >> 2] = type;
        HEAP32[ai + 12 >> 2] = proto;
        HEAPU32[ai + 24 >> 2] = canon;
        HEAPU32[ai + 20 >> 2] = sa;
        if (family === 10) {
            HEAP32[ai + 16 >> 2] = 28
        } else {
            HEAP32[ai + 16 >> 2] = 16
        }
        HEAP32[ai + 28 >> 2] = 0;
        return ai
    }
    if (hint) {
        flags = HEAP32[hint >> 2];
        family = HEAP32[hint + 4 >> 2];
        type = HEAP32[hint + 8 >> 2];
        proto = HEAP32[hint + 12 >> 2]
    }
    if (type && !proto) {
        proto = type === 2 ? 17 : 6
    }
    if (!type && proto) {
        type = proto === 17 ? 2 : 1
    }
    if (proto === 0) {
        proto = 6
    }
    if (type === 0) {
        type = 1
    }
    if (!node && !service) {
        return -2
    }
    if (flags & ~(1 | 2 | 4 | 1024 | 8 | 16 | 32)) {
        return -1
    }
    if (hint !== 0 && HEAP32[hint >> 2] & 2 && !node) {
        return -1
    }
    if (flags & 32) {
        return -2
    }
    if (type !== 0 && type !== 1 && type !== 2) {
        return -7
    }
    if (family !== 0 && family !== 2 && family !== 10) {
        return -6
    }
    if (service) {
        service = UTF8ToString(service);
        port = parseInt(service, 10);
        if (isNaN(port)) {
            if (flags & 1024) {
                return -2
            }
            return -8
        }
    }
    if (!node) {
        if (family === 0) {
            family = 2
        }
        if ((flags & 1) === 0) {
            if (family === 2) {
                addr = _htonl(2130706433)
            } else {
                addr = [0, 0, 0, _htonl(1)]
            }
        }
        ai = allocaddrinfo(family, type, proto, null, addr, port);
        HEAPU32[out >> 2] = ai;
        return 0
    }
    node = UTF8ToString(node);
    addr = inetPton4(node);
    if (addr !== null) {
        if (family === 0 || family === 2) {
            family = 2
        } else if (family === 10 && flags & 8) {
            addr = [0, 0, _htonl(65535), addr];
            family = 10
        } else {
            return -2
        }
    } else {
        addr = inetPton6(node);
        if (addr !== null) {
            if (family === 0 || family === 10) {
                family = 10
            } else {
                return -2
            }
        }
    }
    if (addr != null) {
        ai = allocaddrinfo(family, type, proto, node, addr, port);
        HEAPU32[out >> 2] = ai;
        return 0
    }
    if (flags & 4) {
        return -2
    }
    node = DNS.lookup_name(node);
    addr = inetPton4(node);
    if (family === 0) {
        family = 2
    } else if (family === 10) {
        addr = [0, 0, _htonl(65535), addr]
    }
    ai = allocaddrinfo(family, type, proto, null, addr, port);
    HEAPU32[out >> 2] = ai;
    return 0
};
var autoResumeAudioContext = ctx => {
    for (var event of ["keydown", "mousedown", "touchstart"]) {
        for (var element of [document, document.getElementById("canvas")]) {
            element?.addEventListener(event, () => {
                if (ctx.state === "suspended") ctx.resume()
            }, {
                once: true
            })
        }
    }
};
var dynCall = (sig, ptr, args = [], promising = false) => {
    var func = getWasmTableEntry(ptr);
    var rtn = func(...args);

    function convert(rtn) {
        return rtn
    }
    return convert(rtn)
};
var requestFullscreen = Browser.requestFullscreen;
var FS_createPath = (...args) => FS.createPath(...args);
var FS_unlink = (...args) => FS.unlink(...args);
var FS_createLazyFile = (...args) => FS.createLazyFile(...args);
var FS_createDevice = (...args) => FS.createDevice(...args);
var createContext = Browser.createContext;
FS.createPreloadedFile = FS_createPreloadedFile;
FS.preloadFile = FS_preloadFile;
FS.staticInit();
Module["requestAnimationFrame"] = MainLoop.requestAnimationFrame;
Module["pauseMainLoop"] = MainLoop.pause;
Module["resumeMainLoop"] = MainLoop.resume;
MainLoop.init();
for (let i = 0; i < 32; ++i) tempFixedLengthArray.push(new Array(i));
var miniTempWebGLFloatBuffersStorage = new Float32Array(288);
for (var i = 0; i <= 288; ++i) {
    miniTempWebGLFloatBuffers[i] = miniTempWebGLFloatBuffersStorage.subarray(0, i)
}
var miniTempWebGLIntBuffersStorage = new Int32Array(288);
for (var i = 0; i <= 288; ++i) {
    miniTempWebGLIntBuffers[i] = miniTempWebGLIntBuffersStorage.subarray(0, i)
} {
    if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
    if (Module["preloadPlugins"]) preloadPlugins = Module["preloadPlugins"];
    if (Module["print"]) out = Module["print"];
    if (Module["printErr"]) err = Module["printErr"];
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["preInit"]) {
        if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
        while (Module["preInit"].length > 0) {
            Module["preInit"].shift()()
        }
    }
}
Module["addRunDependency"] = addRunDependency;
Module["removeRunDependency"] = removeRunDependency;
Module["requestFullscreen"] = requestFullscreen;
Module["createContext"] = createContext;
Module["FS_preloadFile"] = FS_preloadFile;
Module["FS_unlink"] = FS_unlink;
Module["FS_createPath"] = FS_createPath;
Module["FS_createDevice"] = FS_createDevice;
Module["FS_createDataFile"] = FS_createDataFile;
Module["FS_createLazyFile"] = FS_createLazyFile;
var ASM_CONSTS = {
    9246232: () => {
        FS.syncfs(false, function(err) {
            console.log(err)
        })
    },
    9246287: () => {
        FS.mkdir("/persist");
        FS.mount(IDBFS, {}, "/persist");
        FS.syncfs(true, function(err) {})
    },
    9246376: $0 => {
        var str = UTF8ToString($0) + "\n\n" + "Abort/Retry/Ignore/AlwaysIgnore? [ariA] :";
        var reply = window.prompt(str, "i");
        if (reply === null) {
            reply = "i"
        }
        return reply.length === 1 ? reply.charCodeAt(0) : -1
    },
    9246591: () => {
        if (typeof AudioContext !== "undefined") {
            return true
        } else if (typeof webkitAudioContext !== "undefined") {
            return true
        }
        return false
    },
    9246738: () => {
        if (typeof navigator.mediaDevices !== "undefined" && typeof navigator.mediaDevices.getUserMedia !== "undefined") {
            return true
        } else if (typeof navigator.webkitGetUserMedia !== "undefined") {
            return true
        }
        return false
    },
    9246972: $0 => {
        if (typeof Module["SDL2"] === "undefined") {
            Module["SDL2"] = {}
        }
        var SDL2 = Module["SDL2"];
        if (!$0) {
            SDL2.audio = {}
        } else {
            SDL2.capture = {}
        }
        if (!SDL2.audioContext) {
            if (typeof AudioContext !== "undefined") {
                SDL2.audioContext = new AudioContext
            } else if (typeof webkitAudioContext !== "undefined") {
                SDL2.audioContext = new webkitAudioContext
            }
            if (SDL2.audioContext) {
                if (typeof navigator.userActivation === "undefined") {
                    autoResumeAudioContext(SDL2.audioContext)
                }
            }
        }
        return SDL2.audioContext === undefined ? -1 : 0
    },
    9247524: () => {
        var SDL2 = Module["SDL2"];
        return SDL2.audioContext.sampleRate
    },
    9247592: ($0, $1, $2, $3) => {
        var SDL2 = Module["SDL2"];
        var have_microphone = function(stream) {
            if (SDL2.capture.silenceTimer !== undefined) {
                clearInterval(SDL2.capture.silenceTimer);
                SDL2.capture.silenceTimer = undefined;
                SDL2.capture.silenceBuffer = undefined
            }
            SDL2.capture.mediaStreamNode = SDL2.audioContext.createMediaStreamSource(stream);
            SDL2.capture.scriptProcessorNode = SDL2.audioContext.createScriptProcessor($1, $0, 1);
            SDL2.capture.scriptProcessorNode.onaudioprocess = function(audioProcessingEvent) {
                if (SDL2 === undefined || SDL2.capture === undefined) {
                    return
                }
                audioProcessingEvent.outputBuffer.getChannelData(0).fill(0);
                SDL2.capture.currentCaptureBuffer = audioProcessingEvent.inputBuffer;
                dynCall("vp", $2, [$3])
            };
            SDL2.capture.mediaStreamNode.connect(SDL2.capture.scriptProcessorNode);
            SDL2.capture.scriptProcessorNode.connect(SDL2.audioContext.destination);
            SDL2.capture.stream = stream
        };
        var no_microphone = function(error) {};
        SDL2.capture.silenceBuffer = SDL2.audioContext.createBuffer($0, $1, SDL2.audioContext.sampleRate);
        SDL2.capture.silenceBuffer.getChannelData(0).fill(0);
        var silence_callback = function() {
            SDL2.capture.currentCaptureBuffer = SDL2.capture.silenceBuffer;
            dynCall("vp", $2, [$3])
        };
        SDL2.capture.silenceTimer = setInterval(silence_callback, $1 / SDL2.audioContext.sampleRate * 1e3);
        if (navigator.mediaDevices !== undefined && navigator.mediaDevices.getUserMedia !== undefined) {
            navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            }).then(have_microphone).catch(no_microphone)
        } else if (navigator.webkitGetUserMedia !== undefined) {
            navigator.webkitGetUserMedia({
                audio: true,
                video: false
            }, have_microphone, no_microphone)
        }
    },
    9249285: ($0, $1, $2, $3) => {
        var SDL2 = Module["SDL2"];
        SDL2.audio.scriptProcessorNode = SDL2.audioContext["createScriptProcessor"]($1, 0, $0);
        SDL2.audio.scriptProcessorNode["onaudioprocess"] = function(e) {
            if (SDL2 === undefined || SDL2.audio === undefined) {
                return
            }
            if (SDL2.audio.silenceTimer !== undefined) {
                clearInterval(SDL2.audio.silenceTimer);
                SDL2.audio.silenceTimer = undefined;
                SDL2.audio.silenceBuffer = undefined
            }
            SDL2.audio.currentOutputBuffer = e["outputBuffer"];
            dynCall("vp", $2, [$3])
        };
        SDL2.audio.scriptProcessorNode["connect"](SDL2.audioContext["destination"]);
        if (SDL2.audioContext.state === "suspended") {
            SDL2.audio.silenceBuffer = SDL2.audioContext.createBuffer($0, $1, SDL2.audioContext.sampleRate);
            SDL2.audio.silenceBuffer.getChannelData(0).fill(0);
            var silence_callback = function() {
                if (typeof navigator.userActivation !== "undefined") {
                    if (navigator.userActivation.hasBeenActive) {
                        SDL2.audioContext.resume()
                    }
                }
                SDL2.audio.currentOutputBuffer = SDL2.audio.silenceBuffer;
                dynCall("vp", $2, [$3]);
                SDL2.audio.currentOutputBuffer = undefined
            };
            SDL2.audio.silenceTimer = setInterval(silence_callback, $1 / SDL2.audioContext.sampleRate * 1e3)
        }
    },
    9250460: ($0, $1) => {
        var SDL2 = Module["SDL2"];
        var numChannels = SDL2.capture.currentCaptureBuffer.numberOfChannels;
        for (var c = 0; c < numChannels; ++c) {
            var channelData = SDL2.capture.currentCaptureBuffer.getChannelData(c);
            if (channelData.length != $1) {
                throw "Web Audio capture buffer length mismatch! Destination size: " + channelData.length + " samples vs expected " + $1 + " samples!"
            }
            if (numChannels == 1) {
                for (var j = 0; j < $1; ++j) {
                    setValue($0 + j * 4, channelData[j], "float")
                }
            } else {
                for (var j = 0; j < $1; ++j) {
                    setValue($0 + (j * numChannels + c) * 4, channelData[j], "float")
                }
            }
        }
    },
    9251065: ($0, $1) => {
        var SDL2 = Module["SDL2"];
        var buf = $0 >>> 2;
        var numChannels = SDL2.audio.currentOutputBuffer["numberOfChannels"];
        for (var c = 0; c < numChannels; ++c) {
            var channelData = SDL2.audio.currentOutputBuffer["getChannelData"](c);
            if (channelData.length != $1) {
                throw "Web Audio output buffer length mismatch! Destination size: " + channelData.length + " samples vs expected " + $1 + " samples!"
            }
            for (var j = 0; j < $1; ++j) {
                channelData[j] = HEAPF32[buf + (j * numChannels + c)]
            }
        }
    },
    9251554: $0 => {
        var SDL2 = Module["SDL2"];
        if ($0) {
            if (SDL2.capture.silenceTimer !== undefined) {
                clearInterval(SDL2.capture.silenceTimer)
            }
            if (SDL2.capture.stream !== undefined) {
                var tracks = SDL2.capture.stream.getAudioTracks();
                for (var i = 0; i < tracks.length; i++) {
                    SDL2.capture.stream.removeTrack(tracks[i])
                }
            }
            if (SDL2.capture.scriptProcessorNode !== undefined) {
                SDL2.capture.scriptProcessorNode.onaudioprocess = function(audioProcessingEvent) {};
                SDL2.capture.scriptProcessorNode.disconnect()
            }
            if (SDL2.capture.mediaStreamNode !== undefined) {
                SDL2.capture.mediaStreamNode.disconnect()
            }
            SDL2.capture = undefined
        } else {
            if (SDL2.audio.scriptProcessorNode != undefined) {
                SDL2.audio.scriptProcessorNode.disconnect()
            }
            if (SDL2.audio.silenceTimer !== undefined) {
                clearInterval(SDL2.audio.silenceTimer)
            }
            SDL2.audio = undefined
        }
        if (SDL2.audioContext !== undefined && SDL2.audio === undefined && SDL2.capture === undefined) {
            SDL2.audioContext.close();
            SDL2.audioContext = undefined
        }
    },
    9252560: ($0, $1, $2) => {
        var w = $0;
        var h = $1;
        var pixels = $2;
        if (!Module["SDL2"]) Module["SDL2"] = {};
        var SDL2 = Module["SDL2"];
        if (SDL2.ctxCanvas !== Module["canvas"]) {
            SDL2.ctx = Browser.createContext(Module["canvas"], false, true);
            SDL2.ctxCanvas = Module["canvas"]
        }
        if (SDL2.w !== w || SDL2.h !== h || SDL2.imageCtx !== SDL2.ctx) {
            SDL2.image = SDL2.ctx.createImageData(w, h);
            SDL2.w = w;
            SDL2.h = h;
            SDL2.imageCtx = SDL2.ctx
        }
        var data = SDL2.image.data;
        var src = pixels / 4;
        var dst = 0;
        var num;
        if (typeof CanvasPixelArray !== "undefined" && data instanceof CanvasPixelArray) {
            num = data.length;
            while (dst < num) {
                var val = HEAP32[src];
                data[dst] = val & 255;
                data[dst + 1] = val >> 8 & 255;
                data[dst + 2] = val >> 16 & 255;
                data[dst + 3] = 255;
                src++;
                dst += 4
            }
        } else {
            if (SDL2.data32Data !== data) {
                SDL2.data32 = new Int32Array(data.buffer);
                SDL2.data8 = new Uint8Array(data.buffer);
                SDL2.data32Data = data
            }
            var data32 = SDL2.data32;
            num = data32.length;
            data32.set(HEAP32.subarray(src, src + num));
            var data8 = SDL2.data8;
            var i = 3;
            var j = i + 4 * num;
            if (num % 8 == 0) {
                while (i < j) {
                    data8[i] = 255;
                    i = i + 4 | 0;
                    data8[i] = 255;
                    i = i + 4 | 0;
                    data8[i] = 255;
                    i = i + 4 | 0;
                    data8[i] = 255;
                    i = i + 4 | 0;
                    data8[i] = 255;
                    i = i + 4 | 0;
                    data8[i] = 255;
                    i = i + 4 | 0;
                    data8[i] = 255;
                    i = i + 4 | 0;
                    data8[i] = 255;
                    i = i + 4 | 0
                }
            } else {
                while (i < j) {
                    data8[i] = 255;
                    i = i + 4 | 0
                }
            }
        }
        SDL2.ctx.putImageData(SDL2.image, 0, 0)
    },
    9254026: ($0, $1, $2, $3, $4) => {
        var w = $0;
        var h = $1;
        var hot_x = $2;
        var hot_y = $3;
        var pixels = $4;
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        var image = ctx.createImageData(w, h);
        var data = image.data;
        var src = pixels / 4;
        var dst = 0;
        var num;
        if (typeof CanvasPixelArray !== "undefined" && data instanceof CanvasPixelArray) {
            num = data.length;
            while (dst < num) {
                var val = HEAP32[src];
                data[dst] = val & 255;
                data[dst + 1] = val >> 8 & 255;
                data[dst + 2] = val >> 16 & 255;
                data[dst + 3] = val >> 24 & 255;
                src++;
                dst += 4
            }
        } else {
            var data32 = new Int32Array(data.buffer);
            num = data32.length;
            data32.set(HEAP32.subarray(src, src + num))
        }
        ctx.putImageData(image, 0, 0);
        var url = hot_x === 0 && hot_y === 0 ? "url(" + canvas.toDataURL() + "), auto" : "url(" + canvas.toDataURL() + ") " + hot_x + " " + hot_y + ", auto";
        var urlBuf = _malloc(url.length + 1);
        stringToUTF8(url, urlBuf, url.length + 1);
        return urlBuf
    },
    9255014: $0 => {
        if (Module["canvas"]) {
            Module["canvas"].style["cursor"] = UTF8ToString($0)
        }
    },
    9255097: () => {
        if (Module["canvas"]) {
            Module["canvas"].style["cursor"] = "none"
        }
    },
    9255166: () => window.innerWidth,
    9255196: () => window.innerHeight,
    9255227: ($0, $1) => {
        alert(UTF8ToString($0) + "\n\n" + UTF8ToString($1))
    }
};
var _TaskExit, _TaskInit, _HeapCtrlInit, ___AIWNIOS_MAlloc, _QueInit, _QueIns, _HashTableNew, _QueRem, _QueCnt, _QueDel, ___AIWNIOS_Free, _DebuggerClientSetGreg, _DebuggerClientStart, _AiwnBCDbgCurContext, _DebuggerClientEnd, _DebuggerClientWatchThisTID, _DebuggerBegin, _InstallDbgSignalsForThread, ___enter_try, ___throw, _AIWNIOS_ExitCatch, _HashFind, _FFI_CALL_TOS_1, _AIWNIOS_throw, _AIWNIOS_enter_try, ___wasm_setjmp_test, _setTempRet0, _getTempRet0, _emscripten_longjmp, ___wasm_setjmp, _GenFFIBinding, _BCGenerateFFICall, _GenFFIBindingNaked, _FileRead, _open, ___AIWNIOS_CAlloc, _fstat, _read, _close, _VFsThrdInit, _VFsSetDrv, _toupper, _VFsFOpen, _strlen, _strdup, _VFsFClose, _VFsDel, _access, _stat, _remove, _opendir, _readdir, _strcpy, _closedir, _rmdir, _VFsUnixTime, _VFsDir, _rewinddir, ___AIWNIOS_StrDup, _VFsFSize, _VFsFileWrite, _write, _VFsIsDir, _VFsFileRead, _VFsFileExists, _VFsMountDrive, _VFsFBlkRead, _VFsFBlkWrite, _VFsFSeek, _lseek, _VFsTrunc, _truncate, _VFsSetPwd, _VFsDirMk, _mkdir, _CreateTemplateBootDrv, _snprintf, _fputs, _siprintf, _rename, _fwrite, _strchr, _strcat, _fopen, _fclose, _fread, _ResolveBootDir, _iprintf, _localtime, _mktime, _HashStr, _HashDel, _strcmp, _HashSingleTableFind, _HashBucketFind, _HashAdd, _HashRemDel, _HashTableDel, _TermSetKbCb, _AiwniosTUIEnable, _TermSize, _TermSetMsCb, _TUIInputLoop, _LexSrcLink, _LexAdvChr, _Lex, _CmpCtrlNew, _CodeCtrlPush, _ParseExpr, _Compile, _FFI_CALL_TOS_0, _CodeCtrlPop, _CmpCtrlDel, _strrchr, _fseek, _ftell, _log10, _pow, _vsprintf, _fiprintf, _isxdigit, _LexerNew, _LexerDel, _HeapCtrlDel, _LexerDump, _putchar, ___small_printf, _Load, _ImportSymbolsToHolyC, _FFI_CALL_TOS_2, _LoadMainsWasm, _FFI_CALL_TOS_0_FEW_INSTS, _lzw_decompress, _UnixNow, _time, _getstkptr, _setstkptr, _IsCmdLineMode, _IsCmdLineMode2, _STK_TermSize, _CmdLineBootFiles, _CmdLineBootFileCnt, _IsFastFail, _STK_IsFastFail, _main, _SDL_SetMainReady, _setlocale, _atexit, _getrlimit, _setrlimit, ___bootstrap_tls, _arg_lit0, _arg_file0, _arg_filen, _arg_end, _arg_parse, _arg_print_errors, _puts, _arg_print_glossary, _fork, _setsid, _signal, _ftruncate, _getpid, _umask, _InitBoundsChecker, _getuid, _getpwuid, _InitSound, _SDL_Init, _SDL_RegisterEvents, _DrawWindowNew, _DeinitVideo, _DeinitSound, _SDL_Quit, _arg_freetable, _SDL_GetError, _calloc, _PrsStmt, _PrsBindCSymbol, _ScreenUpdateInProgress, _AiwnBCMakeContext, _AiwnBCTaskContextSetRIP, _AiwnBCTaskContextGetRIP, _AiwnBCTaskContextGetRBP, _AiwnBC_FP, _PrsBindCSymbolNaked, _AiwnBCContextGet, _AiwnBCContextSet, _CompileBC, _ABCStateDel, _ABCStateNew, _ABCRun, _AiwnBCDel, _ICFwd, _DolDocDumpIR, _AiwniosSetVolume, _AiwniosGetVolume, ___HC_ICAdd_Min_F64, ___HC_ICAdd_Max_F64, ___HC_ICAdd_Min_I64, ___HC_ICAdd_Max_I64, ___HC_ICAdd_Min_U64, ___HC_ICAdd_Max_U64, _ic_readline, _MPSetProfilerInt, _BoundsCheck, ___HC_ICAdd_RawBytes, ___HC_SetAOTRelocBeforeRIP, ___HC_CodeMiscIsUsed, _SDL_SetClipboardText, _SDL_HasClipboardText, _SDL_GetClipboardText, _SDL_free, _cos, _sin, _tan, _atan2, _acos, _asin, _atan, _exp, _Btc, ___HC_ICSetLock, _MSize, _MPSleepHP, _clock_gettime, _strstr, _strcasestr, _strncmp, _strcasecmp, _strncasecmp, _log2, _round, _log, _Bt, _LBtc, _LBts, _LBtr, _Bts, _Btr, _fflush, _SetHolyFs, _GetHolyFs, _WriteProtectMemCpy, _SpawnCore, _MPAwake, _mp_cnt, _GetHolyGs, _SetHolyGs, _BCAwake, _AiwnBCCall, _AiwnBCCallArgs, ___HC_ICAdd_ToBool, ___HC_ICAdd_GetVargsPtr, ___HC_CmpCtrl_SetAOT, ___HC_ICAdd_Typecast, ___HC_ICAdd_SubCall, ___HC_ICAdd_SubProlog, ___HC_ICAdd_SubRet, ___HC_ICAdd_Switch, ___HC_ICAdd_UnboundedSwitch, ___HC_ICAdd_PreInc, ___HC_ICAdd_Call, ___HC_ICAdd_F64, ___HC_ICAdd_I64, ___HC_ICAdd_PreDec, ___HC_ICAdd_PostDec, ___HC_ICAdd_PostInc, ___HC_ICAdd_Pow, ___HC_ICAdd_Eq, ___HC_ICAdd_Div, ___HC_ICAdd_Sub, ___HC_ICAdd_Mul, ___HC_ICAdd_Add, ___HC_ICAdd_Deref, ___HC_ICAdd_Comma, ___HC_ICAdd_Addr, ___HC_ICAdd_Xor, ___HC_ICAdd_Mod, ___HC_ICAdd_Or, ___HC_ICAdd_Lt, ___HC_ICAdd_Gt, ___HC_ICAdd_Le, ___HC_ICAdd_Ge, ___HC_ICAdd_LNot, ___HC_ICAdd_Vargs, ___HC_ICAdd_BNot, ___HC_ICAdd_AndAnd, ___HC_ICAdd_OrOr, ___HC_ICAdd_XorXor, ___HC_ICAdd_Ne, ___HC_ICAdd_Lsh, ___HC_ICAdd_Rsh, ___HC_ICAdd_AddEq, ___HC_ICAdd_SubEq, ___HC_ICAdd_MulEq, ___HC_ICAdd_DivEq, ___HC_ICAdd_LshEq, ___HC_ICAdd_RshEq, ___HC_ICAdd_AndEq, ___HC_ICAdd_OrEq, ___HC_ICAdd_XorEq, ___HC_ICAdd_ModEq, ___HC_ICAdd_FReg, ___HC_ICAdd_IReg, ___HC_ICAdd_Frame, ___HC_CodeMiscStrNew, ___HC_CodeMiscLabelNew, ___HC_CmpCtrlNew, ___HC_CodeCtrlPush, ___HC_CodeCtrlPop, ___HC_Compile, ___HC_CodeMiscJmpTableNew, ___HC_ICAdd_Label, ___HC_ICAdd_Goto, ___HC_ICAdd_GotoIf, ___HC_ICAdd_Str, ___HC_ICAdd_And, ___HC_ICAdd_Lock, ___HC_ICAdd_Fs, ___HC_ICAdd_Gs, ___HC_ICAdd_EqEq, ___HC_ICAdd_Neg, ___HC_ICAdd_Ret, ___HC_ICAdd_Arg, ___HC_ICAdd_SetFrameSize, ___HC_ICAdd_Reloc, ___HC_ICAdd_RelocUnqiue, ___HC_ICSetLine, ___HC_ICAdd_StaticRef, ___HC_ICAdd_StaticData, ___HC_ICAdd_SetStaticsSize, ___HC_ICAdd_ToI64, ___HC_ICAdd_ToF64, ___HC_ICAdd_ShortAddr, ___HC_CodeMiscInterateThroughRefs, ___HC_ICAdd_BT, ___HC_ICAdd_BTS, ___HC_ICAdd_BTR, ___HC_ICAdd_BTC, ___HC_ICAdd_LBTS, ___HC_ICAdd_LBTR, ___HC_ICAdd_LBTC, _GrPaletteColorSet, _UpdateScreen, _SetKBCallback, _SndFreq, ___HC_ICAdd_Sqrt, ___HC_ICAdd_Sqr, _SetMSCallback, _InteruptCore, _SDL_GetTicks, _SDL_PushEvent, _NetSocketNew, _NetUDPAddrNew, _NetUDPSocketNew, _NetUDPRecvFrom, _NetUDPSendTo, _NetUDPAddrDel, _NetIP4ByHost, _NetBindIn, _NetListen, _NetAccept, _NetClose, _NetRead, _NetWrite, _NetPollForHangup, _NetPollForRead, _NetPollForWrite, _NetAddrDel, _NetAddrNew, _NetConnect, _SetCaptureMouse, _EMInputLoopRun, _malloc, _IsValidPtr, _sysconf, _msync, _MemGetWritePtr, _MemGetExecPtr, _WhichFun, _DoNothing, _BCInterupt, _OptPassFixFunArgs, _AssignRawTypeToNode, _ICArgN, _OptPassExpandPtrs, _ICFree, _OptPassMergeCommunitives, _OptPassConstFold, _abort, _fmod, _OptPassRegAlloc, _qsort, _OptPassRemoveUselessArith, _OptPassFinal, _OptPassFinalBC, _CodeCtrlPopNoFree, _CodeCtrlAppend, _CodeCtrlDel, _CodeMiscNew, _ParserDumpIR, _vsnprintf, _MemberFind, _SysSymImportsResolve, _PrsType, _ParseErr, _ParseWarn, _PrsArrayDim, _PrsFunArgs, _PrsKw, _PrsGoto, __PrsStmt, _PrsTry, _PrsReturn, _PrsScope, _PrsIf, _PrsFor, _PrsSwitch, _PrsWhile, _PrsDo, _PrsClass, _PrsDecl, _PrsI64, _PrsF64, _PrsArray, _PrsClassNew, _AddRelocMisc, _CodeMiscAddRef, _CacheRPNArgs, _inet_ntoa, _freeaddrinfo, _inet_addr, _socket, _BigEndianIPAddrByHostname, _connect, _bind, _listen, _accept, _shutdown, _poll, _recvfrom, _ntohs, _gethostbyname, _htons, _sendto, _SDL_PauseAudioDevice, _SDL_OpenAudioDevice, _SDL_CloseAudioDevice, _AiwnRunBC, _SDL_GetTicks64, _AiwnBCAddMem, _ABCRun_Done, _FFI_CALL_TOS_3, _FFI_CALL_TOS_4, _FFI_CALL_TOS_CUSTOM_BP, _AiwnBCDbgFault, _SDL_LockMutex, _SDL_DestroyRenderer, _SDL_DestroyWindow, _SDL_LockSurface, _SDL_UnlockSurface, _SDL_RenderClear, _SDL_GetWindowSize, _SDL_CreateTextureFromSurface, _SDL_ShowSimpleMessageBox, _SDL_RenderCopy, _SDL_RenderPresent, _SDL_DestroyTexture, _SDL_SetPaletteColors, _SDL_AddEventWatch, _SDL_GetRelativeMouseMode, _InputLoop, _SDL_WaitEvent, _SDL_PollEvent, _WaitForSDLQuit, _SDL_WaitThread, _SDL_SetRelativeMouseMode, _SDL_SetWindowMouseGrab, _SDL_CreateMutex, _SDL_SetHintWithPriority, _SDL_CreateWindow, _SDL_SetWindowKeyboardGrab, _SDL_CreateRGBSurface, _SDL_SetWindowMinimumSize, _SDL_ShowCursor, _SDL_CreateRenderer, _SDL_UnlockMutex, _LBt, _arg_dstr_create, _arg_dstr_destroy, _arg_dstr_reset, _arg_dstr_set, _arg_dstr_cstr, _arg_dstr_cat, _arg_dstr_catc, _arg_dstr_catf, _arg_dstr_free, _argtable3_xmalloc, _argtable3_xfree, _arg_print_errors_ds, _arg_file1, _arg_print_option_ds, _arg_litn, _arg_lit1, _dbg_printf, _arg_set_panic, _vfprintf, _argtable3_xcalloc, _argtable3_xrealloc, _arg_mgsort, _getenv, _getopt_long, _strcspn, _strncat, _arg_print_option, _arg_print_syntax_ds, _arg_print_syntax, _arg_print_syntaxv_ds, _arg_print_syntaxv, _arg_print_glossary_ds, _arg_print_formatted, _arg_print_glossary_gnu_ds, _arg_print_glossary_gnu, _arg_nullcheck, _arg_free, _getopt, _warnx, _getopt_long_only, _ic_editline, _term_start_raw, _term_write, _term_end_raw, _sbuf_new, _fgetc, _sbuf_append_char, _sbuf_free_dup, _ic_get_env, _ic_printf, _bbcode_vprintf, _ic_vprintf, _ic_print, _bbcode_print, _ic_println, _bbcode_println, _ic_style_def, _bbcode_style_def, _ic_style_open, _bbcode_style_open, _ic_style_close, _bbcode_style_close, _ic_async_stop, _tty_async_stop, _ic_get_prompt_marker, _ic_get_continuation_prompt_marker, _ic_set_prompt_marker, _mem_free, _mem_strdup, _ic_enable_multiline, _ic_enable_beep, _term_enable_beep, _ic_enable_color, _term_enable_color, _ic_enable_history_duplicates, _history_enable_duplicates, _ic_set_history, _history_load_from, _ic_history_remove_last, _history_remove_last, _ic_history_add, _history_push, _ic_history_clear, _history_clear, _ic_enable_auto_tab, _ic_enable_completion_preview, _ic_enable_multiline_indent, _ic_enable_hint, _ic_set_hint_delay, _ic_set_tty_esc_delay, _tty_set_esc_delay, _ic_enable_highlight, _ic_enable_inline_help, _ic_enable_brace_matching, _ic_set_matching_braces, _ic_strlen, _ic_enable_brace_insertion, _ic_set_insertion_braces, _ic_env_get_match_braces, _ic_env_get_auto_braces, _ic_set_default_highlighter, _ic_free, _ic_malloc, _mem_malloc, _ic_strdup, _ic_memcpy, _ic_term_init, _ic_term_done, _ic_term_flush, _term_flush, _ic_term_write, _ic_term_writeln, _term_writeln, _ic_term_writef, _term_vwritef, _ic_term_vwritef, _ic_term_reset, _term_attr_reset, _ic_term_style, _bbcode_style, _term_set_attr, _ic_term_get_color_bits, _term_get_color_bits, _ic_term_bold, _term_bold, _ic_term_underline, _term_underline, _ic_term_italic, _term_italic, _ic_term_reverse, _term_reverse, _ic_term_color_ansi, _color_from_ansi256, _term_color, _term_bgcolor, _ic_term_color_rgb, _ic_rgb, _ic_readline_ex, _completions_get_completer, _ic_set_default_completer, _mem_zalloc, _tty_new, _term_new, _history_new, _completions_new, _bbcode_new, _term_is_interactive, _ic_init_custom_malloc, _history_save, _history_free, _completions_free, _bbcode_free, _term_free, _tty_free, _attr_none, _attr_default, _attr_is_none, _attr_is_eq, _attr_from_color, _attr_update_with, _attr_from_sgr, _attr_from_esc_sgr, _attrbuf_new, _attrbuf_free, _attrbuf_clear, _attrbuf_len, _attrbuf_attrs, _attrbuf_set_at, _attrbuf_update_at, _attrbuf_insert_at, _attrbuf_append_n, _attrbuf_attr_at, _attrbuf_delete_at, _ic_atoz, _ic_rgbx, _debug_msg, _mem_realloc, _ic_memmove, _sbuf_len, _sbuf_append_n, _sbuf_free, _bbcode_style_add, _parse_skip_white, _parse_skip_to_white, _parse_skip_to_end, _parse_attr_name, _parse_value, _parse_tag_value, _ic_strnicmp, _ic_strncpy, _ic_str_tolower, _term_get_attr, _ic_stricmp, _bbcode_process_tag, _sbuf_string, _str_column_width, _str_skip_until_fit, _sbuf_delete_at, _sbuf_insert_at, _str_take_while_fit, _sbuf_insert_char_at, _bbcode_append, _term_write_formatted, _sbuf_clear, _sbuf_append_vprintf, _bbcode_printf, _bbcode_column_width, _sscanf, _ic_istarts_with, _ic_memset, _ic_memnmove, _ic_strcpy, _strncpy, _ic_starts_with, _ic_tolower, _ic_contains, _ic_icontains, _unicode_from_raw, _unicode_is_raw, _unicode_to_qutf8, _utf8_is_cont, _unicode_from_qutf8, _mem_strndup, _ic_complete_filename, _completions_clear, _completions_count, _completions_add, _completions_get_display, _completions_get_help, _completions_get_hint, _completions_set_completer, _ic_completion_arg, _ic_has_completions, _ic_stop_completing, _completions_apply, _sbuf_string_at, _sbuf_delete_from_to, _completions_sort, _completions_apply_longest_prefix, _ic_add_completions, _ic_add_completion_ex, _ic_add_completion, _ic_add_completion_prim, _completions_generate, _ic_complete_word, _ic_complete_qword, _ic_complete_qword_ex, _ic_dirsep, _ic_char_is_nonseparator, _str_prev_ofs, _str_next_ofs, _sbuf_replace, _sbuf_next_ofs, _ic_char_is_filename_letter, _sbuf_append, _lstat, _sbuf_delete_from, _sbuf_appendf, _tty_start_raw, _term_get_width, _editstate_init, _tty_read, _tty_read_timeout, _tty_term_resize_event, _sbuf_get_rc_at_pos, _editstate_capture, _editstate_done, _sbuf_find_word_start, _sbuf_next, _ic_char_is_idletter, _history_count, _term_beep, _history_update, _history_search, _history_get, _editstate_restore, _sbuf_delete_char_before, _code_is_ascii_char, _code_is_unicode, _sbuf_insert_unicode_at, _tty_is_utf8, _sbuf_strdup_from_utf8, _sbuf_strdup, _sbuf_swap_char, _sbuf_find_line_start, _sbuf_find_line_end, _sbuf_char_at, _sbuf_find_ws_word_start, _sbuf_find_word_end, _find_matching_brace, _sbuf_get_pos_at_rc, _sbuf_prev, _term_get_height, _term_up, _term_clear_line, _tty_end_raw, _sbuf_append_tagged, _term_write_repeat, _highlight, _highlight_match_braces, _term_set_buffer_mode, _term_start_of_line, _sbuf_for_each_row, _term_right, _term_update_dim, _sbuf_get_wrapped_rc_at_pos, _tty_code_pushback, _code_is_virt_key, _sbuf_delete_char_at, _term_write_n, _term_write_formatted_n, _term_clear_to_end_of_line, _ic_highlight, _ic_highlight_formatted, _history_load, _feof, _chmod, _memchr, _skip_esc, _sbuf_strdup_at, _sbuf_insert_at_n, _sbuf_split_at, _sbuf_prev_ofs, _sbuf_find_ws_word_end, _ic_prev_char, _ic_next_char, _ic_atoz2, _ic_atou32, _ic_char_is_white, _ic_char_is_nonwhite, _ic_char_is_separator, _ic_char_is_digit, _ic_char_is_hexdigit, _ic_char_is_letter, _ic_is_token, _ic_match_token, _ic_match_any_token, _rgb_remember, _rgb_lookup, _term_append_color, _term_append_bgcolor, _term_left, _term_writef, _term_down, _term_write_char, _fputc, ___errno_location, _isatty, _ioctl, _tty_read_esc_response, _tty_read_esc, _tty_readc_noblock, _tty_cpush_char, _select, _tty_cpop, _tcgetattr, _sigemptyset, _sigaction, _tcsetattr, _SDL_ExitProcess, _SDL_InitMainThread, _SDL_InitTLSData, _SDL_TicksInit, _SDL_LogInit, _SDL_InitSubSystem, _SDL_ClearError, _SDL_EventsInit, _SDL_TimerInit, _SDL_VideoInit, _SDL_AudioInit, _SDL_JoystickInit, _SDL_GameControllerInit, _SDL_SetError, _SDL_SensorInit, _SDL_QuitSubSystem, _SDL_SensorQuit, _SDL_GameControllerQuit, _SDL_JoystickQuit, _SDL_EventsQuit, _SDL_AudioQuit, _SDL_VideoQuit, _SDL_TimerQuit, _SDL_WasInit, _SDL_ClearHints, _SDL_AssertionsQuit, _SDL_memset, _SDL_LogQuit, _SDL_TicksQuit, _SDL_QuitTLSData, _SDL_GetVersion, _SDL_GetHintBoolean, _SDL_GetRevision, _SDL_GetRevisionNumber, _SDL_GetPlatform, _SDL_IsTablet, _SDL_RLESurface, _SDL_UnRLESurface, _SDL_ReportAssertion, _SDL_SetAssertionHandler, _SDL_snprintf, _SDL_malloc, _SDL_getenv, _SDL_strcmp, _SDL_GetFocusWindow, _SDL_GetWindowFlags, _SDL_MinimizeWindow, _SDL_ShowMessageBox, _SDL_RestoreWindow, _SDL_GetAssertionReport, _SDL_ResetAssertionReport, _SDL_GetDefaultAssertionHandler, _SDL_GetAssertionHandler, _SDL_LogMessageV, _SDL_AtomicCAS, _SDL_AtomicCASPtr, _SDL_AtomicSet, _SDL_AtomicSetPtr, _SDL_AtomicAdd, _SDL_AtomicGet, _SDL_AtomicGetPtr, _SDL_MemoryBarrierReleaseFunction, _SDL_MemoryBarrierAcquireFunction, _SDL_AddAudioDevice, _SDL_OpenedAudioDeviceDisconnected, _SDL_RemoveAudioDevice, _SDL_QueueAudio, _SDL_DequeueAudio, _SDL_GetQueuedAudioSize, _SDL_ClearQueuedAudio, _SDL_GetNumAudioDrivers, _SDL_GetAudioDriver, _SDL_EventState, _SDL_AtomicLock, _SDL_AtomicUnlock, _SDL_WriteToDataQueue, _SDL_ReadFromDataQueue, _SDL_CountDataQueue, _SDL_ClearDataQueue, _SDL_GetHint, _SDL_strchr, _SDL_strlen, _SDL_strncasecmp, _SDL_GetCurrentAudioDriver, _SDL_DestroyMutex, _SDL_GetNumAudioDevices, _SDL_GetAudioDeviceName, _SDL_GetAudioDeviceSpec, _SDL_memcpy, _SDL_GetDefaultAudioInfo, _SDL_Error, _SDL_OpenAudio, _SDL_atoi, _SDL_calloc, _SDL_powerof2, _SDL_NewAudioStream, _SDL_NewDataQueue, _SDL_CreateSemaphore, _SDL_CreateThreadInternal, _SDL_DestroySemaphore, _SDL_SemWait, _SDL_GetAudioDeviceStatus, _SDL_GetAudioStatus, _SDL_PauseAudio, _SDL_LockAudioDevice, _SDL_LockAudio, _SDL_UnlockAudioDevice, _SDL_UnlockAudio, _SDL_FreeAudioStream, _SDL_FreeDataQueue, _SDL_CloseAudio, _SDL_FirstAudioFormat, _SDL_NextAudioFormat, _SDL_SilenceValueForFormat, _SDL_CalculateAudioSpec, _SDL_MixAudio, _SDL_MixAudioFormat, _SDL_strdup, _SDL_ThreadID, _SDL_SetThreadPriority, _SDL_SemPost, _SDL_Delay, _SDL_AudioStreamClear, _SDL_AudioStreamPut, _SDL_AudioStreamAvailable, _SDL_AudioStreamGet, _SDL_ConvertAudio, _SDL_BuildAudioCVT, _SDL_ChooseAudioConverters, _SDL_ceil, _SDL_realloc, _SDL_AudioStreamFlush, _SDL_memmove, _SDL_BlendFillRect, _SDL_BlendFillRects, _SDL_BlendLine, _SDL_BlendLines, _SDL_BlendPoint, _SDL_BlendPoints, _SDL_CalculateBlit, _SDL_CalculateBlit0, _SDL_CalculateBlit1, _SDL_CalculateBlitA, _SDL_CalculateBlitN, _SDL_BlitCopy, _SDL_Blit_Slow, _SDL_GetVideoDevice, _SDL_SetPrimarySelectionText, _SDL_GetPrimarySelectionText, _SDL_HasPrimarySelectionText, _SDL_GetCPUCount, _SDL_GetCPUCacheLineSize, _SDL_HasRDTSC, _SDL_HasAltiVec, _SDL_HasMMX, _SDL_Has3DNow, _SDL_HasSSE, _SDL_HasSSE2, _SDL_HasSSE3, _SDL_HasSSE41, _SDL_HasSSE42, _SDL_HasAVX, _SDL_HasAVX2, _SDL_HasAVX512F, _SDL_HasARMSIMD, _SDL_HasNEON, _SDL_HasLSX, _SDL_HasLASX, _SDL_GetSystemRAM, _SDL_SIMDGetAlignment, _SDL_SIMDAlloc, _SDL_SIMDRealloc, _SDL_SIMDFree, _SDL_crc16, _SDL_PeekIntoDataQueue, _SDL_GetDataQueueMutex, _SDL_RWFromFile, _SDL_LogCritical, _SDL_RWwrite, _SDL_RWread, _SDL_RWclose, _SDL_SendDisplayEvent, _SDL_DrawLine, _SDL_DrawLines, _SDL_DrawPoint, _SDL_DrawPoints, _SDL_EGL_SetErrorEx, _SDL_EGL_HasExtension, _SDL_EGL_GetProcAddress, _SDL_EGL_UnloadLibrary, _SDL_EGL_LoadLibraryOnly, _SDL_EGL_LoadLibrary, _SDL_EGL_InitializeOffscreen, _SDL_EGL_SetRequiredVisualId, _SDL_EGL_ChooseConfig, _SDL_EGL_CreateContext, _SDL_EGL_MakeCurrent, _SDL_EGL_DeleteContext, _SDL_EGL_SetSwapInterval, _SDL_EGL_GetSwapInterval, _SDL_EGL_SwapBuffers, _SDL_EGL_CreateSurface, _SDL_EGL_CreateOffscreenSurface, _SDL_EGL_DestroySurface, _Emscripten_HandleCanvasResize, _Emscripten_RegisterEventHandlers, _Emscripten_UnregisterEventHandlers, _Emscripten_CreateWindowFramebuffer, _Emscripten_UpdateWindowFramebuffer, _Emscripten_DestroyWindowFramebuffer, _Emscripten_InitMouse, _Emscripten_FiniMouse, _Emscripten_GLES_LoadLibrary, _Emscripten_GLES_CreateContext, _Emscripten_GLES_MakeCurrent, _Emscripten_GLES_SwapWindow, _SDL_GetErrBuf, _SDL_vsnprintf, _SDL_LogGetPriority, _SDL_LogDebug, _SDL_GetErrorMsg, _SDL_strlcpy, _SDL_StopEventLoop, _SDL_StartEventLoop, _SDL_Log, _SDL_FlushEvents, _SDL_JoystickEventState, _SDL_ToggleDragAndDropSupport, _SDL_PeepEvents, _SDL_HasEvent, _SDL_HasEvents, _SDL_FlushEvent, _SDL_PumpEvents, _SDL_ReleaseAutoReleaseKeys, _SDL_JoystickUpdate, _SDL_SensorUpdate, _SDL_SendPendingSignalEvents, _SDL_WaitEventTimeout, _SDL_NumJoysticks, _SDL_NumSensors, _SDL_GestureProcessEvent, _SDL_SetEventFilter, _SDL_GetEventFilter, _SDL_DelEventWatch, _SDL_FilterEvents, _SDL_SendAppEvent, _SDL_SendSysWMEvent, _SDL_SendKeymapChangedEvent, _SDL_SendLocaleChangedEvent, _SDL_AddHintCallback, _SDL_QuitInit, _SDL_GetStringBoolean, _SDL_QuitQuit, _SDL_DelHintCallback, _SDL_FillRect, _SDL_FillRects, _SDL_GetGameControllerTypeFromString, _SDL_GameControllerGetAxisFromString, _SDL_GameControllerGetStringForAxis, _SDL_GameControllerGetButtonFromString, _SDL_GameControllerGetStringForButton, _SDL_GameControllerAddMappingsFromRW, _SDL_GameControllerAddMapping, _SDL_GameControllerNumMappings, _SDL_GameControllerMappingForIndex, _SDL_GameControllerMappingForGUID, _SDL_GameControllerMapping, _SDL_GameControllerInitMappings, _SDL_strcasecmp, _SDL_RWsize, _SDL_strstr, _SDL_LockJoysticks, _SDL_UnlockJoysticks, _SDL_AssertJoysticksLocked, _SDL_JoystickGetGUIDFromString, _SDL_memcmp, _SDL_JoystickGetGUIDString, _SDL_strlcat, _SDL_JoystickGUIDUsesVersion, _SDL_IsJoystickHIDAPI, _SDL_GetJoystickGUIDInfo, _SDL_IsJoystickXboxSeriesX, _SDL_IsJoystickXboxOneElite, _SDL_IsJoystickSteamController, _SDL_IsJoystickNintendoSwitchJoyConPair, _SDL_GetJoystickGameControllerTypeFromGUID, _SDL_IsJoystickDualSenseEdge, _SDL_IsJoystickRAWINPUT, _SDL_IsJoystickWGI, _SDL_IsJoystickVirtual, _SDL_PrivateJoystickValid, _SDL_LoadVIDPIDList, _SDL_GameControllerGetButton, _SDL_GameControllerGetAxis, _SDL_IsGameController, _SDL_GameControllerNameForIndex, _SDL_JoystickNameForIndex, _SDL_JoystickGetDeviceGUID, _SDL_PrivateJoystickGetAutoGamepadMapping, _SDL_GameControllerPathForIndex, _SDL_JoystickPathForIndex, _SDL_GameControllerTypeForIndex, _SDL_GameControllerMappingForDeviceIndex, _SDL_IsGameControllerNameAndGUID, _SDL_ShouldIgnoreGameController, _SDL_IsJoystickSteamVirtualGamepad, _SDL_VIDPIDInList, _SDL_GameControllerOpen, _SDL_JoystickGetDeviceInstanceID, _SDL_JoystickOpen, _SDL_JoystickClose, _SDL_JoystickGetGUID, _SDL_JoystickName, _SDL_GameControllerUpdate, _SDL_GameControllerHasAxis, _SDL_GameControllerGetBindForAxis, _SDL_JoystickGetAxis, _SDL_JoystickGetButton, _SDL_JoystickGetHat, _SDL_GameControllerHasButton, _SDL_GameControllerGetBindForButton, _SDL_GameControllerGetNumTouchpads, _SDL_GameControllerGetJoystick, _SDL_GameControllerGetNumTouchpadFingers, _SDL_GameControllerGetTouchpadFinger, _SDL_GameControllerHasSensor, _SDL_GameControllerSetSensorEnabled, _SDL_GameControllerIsSensorEnabled, _SDL_GameControllerGetSensorDataRate, _SDL_GameControllerGetSensorData, _SDL_GameControllerGetSensorDataWithTimestamp, _SDL_GameControllerName, _SDL_GameControllerPath, _SDL_JoystickPath, _SDL_GameControllerGetType, _SDL_GetJoystickInstanceVirtualGamepadInfo, _SDL_GameControllerGetPlayerIndex, _SDL_JoystickGetPlayerIndex, _SDL_GameControllerSetPlayerIndex, _SDL_JoystickSetPlayerIndex, _SDL_GameControllerGetVendor, _SDL_JoystickGetVendor, _SDL_GameControllerGetProduct, _SDL_JoystickGetProduct, _SDL_GameControllerGetProductVersion, _SDL_JoystickGetProductVersion, _SDL_GameControllerGetFirmwareVersion, _SDL_JoystickGetFirmwareVersion, _SDL_GameControllerGetSerial, _SDL_JoystickGetSerial, _SDL_GameControllerGetSteamHandle, _SDL_GameControllerGetAttached, _SDL_JoystickGetAttached, _SDL_GameControllerFromInstanceID, _SDL_GameControllerFromPlayerIndex, _SDL_JoystickFromPlayerIndex, _SDL_GameControllerRumble, _SDL_JoystickRumble, _SDL_GameControllerRumbleTriggers, _SDL_JoystickRumbleTriggers, _SDL_GameControllerHasLED, _SDL_JoystickHasLED, _SDL_GameControllerHasRumble, _SDL_JoystickHasRumble, _SDL_GameControllerHasRumbleTriggers, _SDL_JoystickHasRumbleTriggers, _SDL_GameControllerSetLED, _SDL_JoystickSetLED, _SDL_GameControllerSendEffect, _SDL_JoystickSendEffect, _SDL_GameControllerClose, _SDL_GameControllerQuitMappings, _SDL_FreeVIDPIDList, _SDL_GameControllerEventState, _SDL_GameControllerHandleDelayedGuideButton, _SDL_GameControllerGetAppleSFSymbolsNameForButton, _SDL_GameControllerGetAppleSFSymbolsNameForAxis, _SDL_asprintf, _SDL_strtol, _SDL_SetJoystickGUIDCRC, _SDL_SetJoystickGUIDVersion, _SDL_isdigit, _SDL_RecordGesture, _SDL_GestureQuit, _SDL_SaveAllDollarTemplates, _SDL_SaveDollarTemplate, _SDL_LoadDollarTemplates, _SDL_GestureAddTouch, _SDL_GestureDelTouch, _SDL_fabs, _SDL_sqrt, _SDL_atan2, _SDL_cos, _SDL_sin, _SDL_setenv, _setenv, _SDL_GUIDToString, _SDL_GUIDFromString, _SDL_ResetHint, _SDL_ResetHints, _SDL_SetHint, _SDL_JoysticksInitialized, _SDL_JoysticksQuitting, _SDL_JoysticksLocked, _SDL_InitSteamVirtualGamepadInfo, _SDL_QuitSteamVirtualGamepadInfo, _SDL_GetNextJoystickInstanceID, _SDL_SteamVirtualGamepadEnabled, _SDL_JoystickGetDeviceIndexFromInstanceID, _SDL_GetSteamVirtualGamepadInfo, _SDL_JoystickGetDevicePlayerIndex, _SDL_PrivateJoystickBatteryLevel, _SDL_JoystickAttachVirtual, _SDL_JoystickAttachVirtualEx, _SDL_JoystickDetachVirtual, _SDL_JoystickIsVirtual, _SDL_JoystickSetVirtualAxis, _SDL_JoystickSetVirtualButton, _SDL_JoystickSetVirtualHat, _SDL_JoystickNumAxes, _SDL_JoystickNumHats, _SDL_JoystickNumBalls, _SDL_JoystickNumButtons, _SDL_JoystickGetAxisInitialState, _SDL_JoystickGetBall, _SDL_JoystickInstanceID, _SDL_JoystickFromInstanceID, _SDL_PrivateJoystickAddTouchpad, _SDL_PrivateJoystickAddSensor, _SDL_PrivateJoystickAdded, _SDL_PrivateJoystickForceRecentering, _SDL_PrivateJoystickAxis, _SDL_PrivateJoystickButton, _SDL_PrivateJoystickHat, _SDL_PrivateJoystickTouchpad, _SDL_abs, _SDL_HasWindows, _SDL_GetKeyboardFocus, _SDL_PrivateJoystickRemoved, _SDL_PrivateJoystickBall, _SDL_UpdateSteamVirtualGamepadInfo, _SDL_CreateJoystickName, _GuessControllerName, _SDL_GetJoystickGameControllerTypeFromVIDPID, _SDL_tolower, _GuessControllerType, _SDL_CreateJoystickGUID, _SDL_CreateJoystickGUIDForName, _SDL_SetJoystickGUIDVendor, _SDL_SetJoystickGUIDProduct, _SDL_IsJoystickXInput, _SDL_IsJoystickMFI, _SDL_IsJoystickXboxOne, _SDL_IsJoystickBluetoothXboxOne, _SDL_IsJoystickPS4, _SDL_IsJoystickPS5, _SDL_IsJoystickNintendoSwitchPro, _SDL_IsJoystickNintendoSwitchProInputOnly, _SDL_IsJoystickNintendoSwitchJoyCon, _SDL_IsJoystickNintendoSwitchJoyConLeft, _SDL_IsJoystickNintendoSwitchJoyConRight, _SDL_IsJoystickNintendoSwitchJoyConGrip, _SDL_IsJoystickSteamDeck, _SDL_ShouldIgnoreJoystick, _SDL_JoystickGetDeviceVendor, _SDL_JoystickGetDeviceProduct, _SDL_JoystickGetDeviceProductVersion, _SDL_JoystickGetDeviceType, _SDL_JoystickGetType, _SDL_JoystickCurrentPowerLevel, _SDL_PrivateJoystickSensor, _SDL_LoadVIDPIDListFromHints, _SDL_LoadFile, _SDL_UCS4ToUTF8, _SDL_KeyboardInit, _SDL_SetKeymap, _SDL_ResetKeyboard, _SDL_SendKeyboardKey, _SDL_GetDefaultKeymap, _SDL_SetScancodeName, _SDL_SetKeyboardFocus, _SDL_CaptureMouse, _SDL_UpdateMouseCapture, _SDL_SendWindowEvent, _SDL_SendKeyboardUnicodeKey, _SDL_SendVirtualKeyboardKey, _SDL_SendKeyboardKeyAndKeycode, _SDL_SendKeyboardKeyAutoRelease, _SDL_HardwareKeyboardKeyPressed, _SDL_SendKeyboardText, _SDL_utf8strlcpy, _SDL_SendEditingText, _SDL_KeyboardQuit, _SDL_GetKeyboardState, _SDL_GetModState, _SDL_SetModState, _SDL_ToggleModState, _SDL_GetKeyFromScancode, _SDL_GetDefaultKeyFromScancode, _SDL_GetScancodeFromKey, _SDL_GetScancodeName, _SDL_GetScancodeFromName, _SDL_GetKeyName, _SDL_GetKeyFromName, _SDL_ListAdd, _SDL_ListPop, _SDL_ListRemove, _SDL_ListClear, _SDL_LogResetPriorities, _SDL_LogSetAllPriority, _SDL_LogSetPriority, _SDL_LogVerbose, _SDL_LogInfo, _SDL_LogWarn, _SDL_LogError, _SDL_LogMessage, _SDL_LogGetOutputFunction, _SDL_LogSetOutputFunction, _SDL_GetOriginalMemoryFunctions, _SDL_GetMemoryFunctions, _SDL_SetMemoryFunctions, _SDL_GetNumAllocations, _SDL_MousePreInit, _SDL_GetMouse, _SDL_atof, _SDL_AddTouch, _SDL_MousePostInit, _SDL_CreateColorCursor, _SDL_SetDefaultCursor, _SDL_FreeSurface, _SDL_ConvertSurfaceFormat, _SDL_SetCursor, _SDL_GetMouseFocus, _SDL_SetMouseFocus, _SDL_SendMouseMotion, _SDL_SendTouchMotion, _SDL_floor, _SDL_sqrtf, _SDL_GetWindowMouseRect, _SDL_IntersectRect, _SDL_SetMouseSystemScale, _SDL_SendMouseButtonClicks, _SDL_SendTouch, _SDL_SendMouseButton, _SDL_SendMouseWheel, _SDL_MouseQuit, _SDL_FreeCursor, _SDL_GetMessageBoxCount, _SDL_UpdateWindowGrab, _SDL_GetMouseState, _SDL_GetRelativeMouseState, _SDL_GetGlobalMouseState, _SDL_PerformWarpMouseInWindow, _SDL_WarpMouseInWindow, _SDL_WarpMouseGlobal, _SDL_CreateCursor, _SDL_CreateSystemCursor, _SDL_GetCursor, _SDL_GetDefaultCursor, _SDL_GetPixelFormatName, _SDL_PixelFormatEnumToMasks, _SDL_MasksToPixelFormatEnum, _SDL_AllocFormat, _SDL_InitFormat, _SDL_FreeFormat, _SDL_FreePalette, _SDL_AllocPalette, _SDL_SetPixelFormatPalette, _SDL_DitherColors, _SDL_FindColor, _SDL_DetectPalette, _SDL_MapRGB, _SDL_MapRGBA, _SDL_GetRGB, _SDL_GetRGBA, _SDL_AllocBlitMap, _SDL_InvalidateAllBlitMap, _SDL_InvalidateMap, _SDL_MapSurface, _SDL_sscanf, _SDL_FreeBlitMap, _SDL_CalculateGammaRamp, _SDL_pow, _SDL_qsort, _SDL_bsearch, _SDL_SendQuit, _SDL_GetSpanEnclosingRect, _SDL_HasIntersection, _SDL_UnionRect, _SDL_EnclosePoints, _SDL_IntersectRectAndLine, _SDL_HasIntersectionF, _SDL_IntersectFRect, _SDL_UnionFRect, _SDL_EncloseFPoints, _SDL_IntersectFRectAndLine, _SDL_RenderFlush, _SDL_AllocateRenderVertices, _SDL_GetNumRenderDrivers, _SDL_GetRenderDriverInfo, _SDL_CreateWindowAndRenderer, _SDL_HasWindowSurface, _SDL_GetWindowData, _SDL_GetWindowDisplayIndex, _SDL_GetDesktopDisplayMode, _SDL_SetWindowData, _SDL_RenderSetViewport, _SDL_GetRenderer, _SDL_GetRendererOutputSize, _SDL_GetWindowFromID, _SDL_GetRenderTarget, _SDL_SetRenderTarget, _SDL_truncf, _SDL_CreateSoftwareRenderer, _SW_CreateRendererForSurface, _SDL_RenderGetWindow, _SDL_GetRendererInfo, _SDL_QueryTexture, _SDL_CreateTexture, _SDL_SW_CreateYUVTexture, _SDL_SW_DestroyYUVTexture, _SDL_HasColorKey, _SDL_UpdateTexture, _SDL_ConvertSurface, _SDL_GetSurfaceColorMod, _SDL_SetTextureColorMod, _SDL_GetSurfaceAlphaMod, _SDL_SetTextureAlphaMod, _SDL_GetSurfaceBlendMode, _SDL_SetTextureBlendMode, _SDL_SW_UpdateYUVTexture, _SDL_LockTexture, _SDL_SW_CopyYUVToRGB, _SDL_UnlockTexture, _SDL_GetTextureColorMod, _SDL_GetTextureAlphaMod, _SDL_GetTextureBlendMode, _SDL_SetTextureScaleMode, _SDL_GetTextureScaleMode, _SDL_SetTextureUserData, _SDL_GetTextureUserData, _SDL_ConvertPixels, _SDL_UpdateYUVTexture, _SDL_SW_UpdateYUVTexturePlanar, _SDL_UpdateNVTexture, _SDL_SW_UpdateNVTexturePlanar, _SDL_SW_LockYUVTexture, _SDL_LockTextureToSurface, _SDL_CreateRGBSurfaceWithFormatFrom, _SDL_RenderTargetSupported, _SDL_RenderSetLogicalSize, _SDL_RenderSetScale, _SDL_RenderGetLogicalSize, _SDL_RenderSetIntegerScale, _SDL_RenderGetIntegerScale, _SDL_RenderGetViewport, _SDL_RenderSetClipRect, _SDL_RenderGetClipRect, _SDL_RenderIsClipEnabled, _SDL_RenderGetScale, _SDL_RenderWindowToLogical, _SDL_RenderLogicalToWindow, _SDL_SetRenderDrawColor, _SDL_GetRenderDrawColor, _SDL_SetRenderDrawBlendMode, _SDL_GetRenderDrawBlendMode, _SDL_RenderDrawPoint, _SDL_RenderDrawPointsF, _SDL_RenderDrawPointF, _SDL_RenderDrawPoints, _SDL_RenderDrawLine, _SDL_RenderDrawLinesF, _SDL_RenderDrawLineF, _SDL_RenderDrawLines, _SDL_roundf, _SDL_RenderDrawRect, _SDL_RenderDrawRectF, _SDL_RenderDrawRects, _SDL_RenderDrawRectsF, _SDL_RenderFillRect, _SDL_RenderFillRectsF, _SDL_RenderFillRectF, _SDL_RenderFillRects, _SDL_RenderCopyF, _SDL_RenderCopyEx, _SDL_RenderCopyExF, _SDL_sinf, _SDL_cosf, _SDL_RenderGeometry, _SDL_RenderGeometryRaw, _SDL_RenderReadPixels, _SDL_GetWindowPixelFormat, _SDL_DestroyRendererWithoutFreeing, _SDL_GL_BindTexture, _SDL_GL_UnbindTexture, _SDL_RenderGetMetalLayer, _SDL_RenderGetMetalCommandEncoder, _SDL_ComposeCustomBlendMode, _SDL_GetBlendModeSrcColorFactor, _SDL_GetBlendModeDstColorFactor, _SDL_GetBlendModeColorOperation, _SDL_GetBlendModeSrcAlphaFactor, _SDL_GetBlendModeDstAlphaFactor, _SDL_GetBlendModeAlphaOperation, _SDL_RenderSetVSync, _SDL_GL_GetAttribute, _SDL_GL_SetAttribute, _SDL_RecreateWindow, _SDL_GL_CreateContext, _SDL_GL_MakeCurrent, _SDL_GL_DeleteContext, _SDL_GL_GetProcAddress, _GLES2_GetTexCoordPrecisionEnumFromHint, _SDL_GL_SetSwapInterval, _SDL_GL_GetSwapInterval, _SDL_GL_ExtensionSupported, _SDL_GL_GetDrawableSize, _SDL_GL_GetCurrentContext, _SDL_atan2f, _SDL_GL_SwapWindowWithResult, _GLES2_GetShader, _GLES2_GetShaderPrologue, _GLES2_GetShaderInclude, _SDL_GetYUVConversionModeForResolution, _SDL_DestroyWindowSurface, _SDL_GetWindowSizeInPixels, _SDL_SetSurfaceColorMod, _SDL_SetSurfaceAlphaMod, _SDL_SetSurfaceBlendMode, _SDL_SetSurfaceRLE, _trianglepoint_2_fixedpoint, _SDL_GetWindowSurface, _SDL_SetClipRect, _SDL_UpperBlit, _SDL_CreateRGBSurfaceWithFormat, _SDL_PrivateUpperBlitScaled, _SDL_CreateRGBSurfaceFrom, _SDLgfx_rotozoomSurfaceSizeTrig, _SDLgfx_rotateSurface, _SDL_SW_BlitTriangle, _SDL_SW_FillTriangle, _SDL_UpdateWindowSurface, _SDL_GetColorKey, _SDL_SetColorKey, _SDL_RWFromFP, _SDL_AllocRW, _fseeko, _ftello, _ferror, _SDL_RWFromMem, _SDL_RWFromConstMem, _SDL_FreeRW, _SDL_LoadFile_RW, _SDL_RWseek, _SDL_RWtell, _SDL_ReadU8, _SDL_ReadLE16, _SDL_ReadBE16, _SDL_ReadLE32, _SDL_ReadBE32, _SDL_ReadLE64, _SDL_ReadBE64, _SDL_WriteU8, _SDL_WriteLE16, _SDL_WriteBE16, _SDL_WriteLE32, _SDL_WriteBE32, _SDL_WriteLE64, _SDL_WriteBE64, _SDL_LockSensors, _SDL_UnlockSensors, _SDL_GetNextSensorInstanceID, _SDL_SensorGetDeviceName, _SDL_SensorGetDeviceType, _SDL_SensorGetDeviceNonPortableType, _SDL_SensorGetDeviceInstanceID, _SDL_SensorOpen, _SDL_SensorFromInstanceID, _SDL_SensorGetName, _SDL_SensorGetType, _SDL_SensorGetNonPortableType, _SDL_SensorGetInstanceID, _SDL_SensorGetData, _SDL_SensorGetDataWithTimestamp, _SDL_SensorClose, _SDL_PrivateSensorUpdate, _SDL_AtomicTryLock, _SDL_atan, _SDL_atanf, _atanf, _atan2f, _SDL_acos, _SDL_acosf, _acosf, _SDL_asin, _SDL_asinf, _asinf, _SDL_ceilf, _SDL_copysign, _SDL_copysignf, _cosf, _SDL_exp, _SDL_expf, _expf, _SDL_fabsf, _SDL_floorf, _SDL_trunc, _SDL_fmod, _SDL_fmodf, _fmodf, _SDL_log, _SDL_logf, _logf, _SDL_log10, _SDL_log10f, _log10f, _SDL_powf, _powf, _SDL_round, _roundf, _SDL_lround, _lround, _SDL_lroundf, _lroundf, _SDL_scalbn, _scalbn, _SDL_scalbnf, _scalbnf, _sinf, _SDL_tan, _SDL_tanf, _tanf, _SDL_isalpha, _SDL_isalnum, _isalnum, _SDL_isxdigit, _SDL_ispunct, _ispunct, _SDL_isspace, _SDL_isupper, _SDL_islower, _SDL_isprint, _SDL_isgraph, _SDL_iscntrl, _iscntrl, _SDL_toupper, _tolower, _SDL_isblank, _isblank, _SDL_strtoul, _SDL_strtoull, _SDL_SoftStretch, _SDL_SoftStretchLinear, _SDL_wcslen, _wcslen, _SDL_wcslcpy, _SDL_wcslcat, _SDL_wcsdup, _SDL_wcsstr, _wcsstr, _SDL_wcscmp, _wcscmp, _SDL_wcsncmp, _wcsncmp, _SDL_wcscasecmp, _wcscasecmp, _SDL_wcsncasecmp, _wcsncasecmp, _strlcpy, _SDL_utf8strlen, _SDL_utf8strnlen, _strlcat, _SDL_strrev, _SDL_strupr, _SDL_strlwr, _SDL_strrchr, _SDL_strcasestr, _SDL_itoa, _SDL_ltoa, _SDL_uitoa, _SDL_ultoa, _SDL_lltoa, _SDL_ulltoa, _atoi, _atof, _strtol, _strtoul, _SDL_strtoll, _strtoll, _strtoull, _SDL_strtod, _strtod, _SDL_strncmp, _vsscanf, _SDL_vsscanf, _SDL_vasprintf, _SDL_SetSurfacePalette, _SDL_HasSurfaceRLE, _SDL_GetClipRect, _SDL_LowerBlit, _SDL_UpperBlitScaled, _SDL_PrivateLowerBlitScaled, _SDL_LowerBlitScaled, _SDL_DuplicateSurface, _SDL_ConvertPixels_YUV_to_YUV, _SDL_ConvertPixels_YUV_to_RGB, _SDL_ConvertPixels_RGB_to_YUV, _SDL_PremultiplyAlpha, _SDL_LoadObject, _SDL_LoadFunction, _SDL_UnloadObject, _SDL_TryLockMutex, _SDL_SemTryWait, _SDL_SemWaitTimeout, _SDL_SemValue, _SDL_SYS_CreateThread, _SDL_SYS_SetupThread, _SDL_SYS_SetThreadPriority, _SDL_SYS_WaitThread, _SDL_SYS_DetachThread, _gettimeofday, _SDL_GetPerformanceCounter, _SDL_GetPerformanceFrequency, _nanosleep, _SDL_SYS_InitTLSData, _SDL_SYS_GetTLSData, _SDL_SYS_SetTLSData, _SDL_SYS_QuitTLSData, _SDL_Generic_InitTLSData, _SDL_Generic_GetTLSData, _SDL_Generic_SetTLSData, _SDL_Generic_QuitTLSData, _SDL_TLSCreate, _SDL_TLSGet, _SDL_TLSSet, _SDL_TLSCleanup, _SDL_RunThread, _SDL_CreateThreadWithStackSize, _SDL_CreateThread, _SDL_GetThreadID, _SDL_GetThreadName, _SDL_DetachThread, _SDL_AddTimer, _SDL_RemoveTimer, _SDL_TouchInit, _SDL_GetNumTouchDevices, _SDL_GetTouchDevice, _SDL_GetTouchName, _SDL_GetTouch, _SDL_GetTouchDeviceType, _SDL_GetNumTouchFingers, _SDL_GetTouchFinger, _SDL_GetWindowID, _SDL_DelTouch, _SDL_TouchQuit, _SDL_GetNumVideoDrivers, _SDL_GetVideoDriver, _dlopen, _dlerror, _dlsym, _dlclose, _eglGetProcAddress, _SDL_AddBasicVideoDisplay, _SDL_AddDisplayMode, _SDL_GetCSSCursorName, _SDL_GL_LoadLibrary, _emscripten_compute_dom_pk_code, _SDL_GetDisplayForWindow, _SDL_StartTextInput, _SDL_ResetDisplayModes, _SDL_GL_ResetAttributes, _SDL_DisableScreenSaver, _SDL_GetCurrentVideoDriver, _SDL_OnVideoThread, _SDL_AddVideoDisplay, _SDL_GetIndexOfDisplay, _SDL_DelVideoDisplay, _SDL_GetNumVideoDisplays, _SDL_GetDisplayDriverData, _SDL_IsVideoContextExternal, _SDL_GetDisplayName, _SDL_GetDisplayBounds, _SDL_GetDisplayUsableBounds, _SDL_GetDisplayDPI, _SDL_GetDisplayOrientation, _bsearch, _SDL_SetCurrentDisplayMode, _SDL_SetDesktopDisplayMode, _SDL_GetNumDisplayModes, _SDL_GetDisplayMode, _SDL_GetCurrentDisplayMode, _SDL_GetClosestDisplayMode, _SDL_GetDisplay, _SDL_GetPointDisplayIndex, _SDL_GetRectDisplayIndex, _SDL_SetWindowDisplayMode, _SDL_GetWindowDisplayMode, _SDL_GetWindowICCProfile, _SDL_Vulkan_LoadLibrary, _SDL_HideWindow, _SDL_SetWindowTitle, _SDL_SetWindowFullscreen, _SDL_SetWindowGrab, _SDL_ShowWindow, _SDL_OnWindowResized, _SDL_CreateWindowFrom, _SDL_GL_UnloadLibrary, _SDL_Vulkan_UnloadLibrary, _SDL_GetWindowTitle, _SDL_SetWindowIcon, _SDL_SetWindowPosition, _SDL_GetWindowPosition, _SDL_SetWindowBordered, _SDL_SetWindowResizable, _SDL_SetWindowAlwaysOnTop, _SDL_SetWindowSize, _SDL_GetWindowBordersSize, _SDL_GetWindowMinimumSize, _SDL_SetWindowMaximumSize, _SDL_GetWindowMaximumSize, _SDL_RaiseWindow, _SDL_MaximizeWindow, _SDL_UpdateWindowSurfaceRects, _SDL_SetWindowBrightness, _SDL_SetWindowGammaRamp, _SDL_GetWindowGammaRamp, _SDL_GetWindowBrightness, _SDL_SetWindowOpacity, _SDL_GetWindowOpacity, _SDL_SetWindowModalFor, _SDL_SetWindowInputFocus, _SDL_GetWindowGrab, _SDL_GetWindowKeyboardGrab, _SDL_GetWindowMouseGrab, _SDL_GetGrabbedWindow, _SDL_SetWindowMouseRect, _SDL_FlashWindow, _SDL_OnWindowShown, _SDL_OnWindowRestored, _SDL_OnWindowHidden, _SDL_OnWindowMoved, _SDL_OnWindowLiveResizeUpdate, _SDL_OnWindowMinimized, _SDL_OnWindowEnter, _SDL_OnWindowLeave, _SDL_OnWindowFocusGained, _SDL_OnWindowFocusLost, _SDL_IsScreenSaverEnabled, _SDL_EnableScreenSaver, _SDL_GL_DeduceMaxSupportedESProfile, _SDL_GL_GetCurrentWindow, _SDL_GL_SwapWindow, _SDL_GetWindowWMInfo, _SDL_ClearComposition, _SDL_IsTextInputShown, _SDL_IsTextInputActive, _SDL_StopTextInput, _SDL_SetTextInputRect, _SDL_HasScreenKeyboardSupport, _SDL_IsScreenKeyboardShown, _SDL_ShouldAllowTopmost, _SDL_SetWindowHitTest, _SDL_ComputeDiagonalDPI, _SDL_OnApplicationWillTerminate, _SDL_OnApplicationDidReceiveMemoryWarning, _SDL_OnApplicationWillResignActive, _SDL_OnApplicationDidEnterBackground, _SDL_OnApplicationWillEnterForeground, _SDL_OnApplicationDidBecomeActive, _SDL_Vulkan_GetVkGetInstanceProcAddr, _SDL_Vulkan_GetInstanceExtensions, _SDL_Vulkan_CreateSurface, _SDL_Vulkan_GetDrawableSize, _SDL_Metal_CreateView, _SDL_Metal_DestroyView, _SDL_Metal_GetLayer, _SDL_Metal_GetDrawableSize, _SDL_SetYUVConversionMode, _SDL_GetYUVConversionMode, _SDL_CalculateYUVSize, _yuv420_rgba_std, _yuv420_rgb24_std, _yuv420_abgr_std, _yuv422_rgba_std, _yuv422_rgb24_std, _yuv422_abgr_std, _yuvnv12_rgba_std, _yuvnv12_rgb24_std, _yuvnv12_abgr_std, _yuv420_rgb565_std, _yuv422_rgb565_std, _yuvnv12_rgb565_std, _yuvnv12_bgra_std, _yuvnv12_argb_std, _yuv422_bgra_std, _yuv422_argb_std, _yuv420_bgra_std, _yuv420_argb_std, _SDL_SW_QueryYUVTexturePixels, _SDL_SW_UnlockYUVTexture, _rgb24_yuv420_std, _emscripten_GetProcAddress, _emscripten_webgl_get_proc_address, _emscripten_webgl1_get_proc_address, __webgl1_match_ext_proc_address_without_suffix, _glfwGetProcAddress, _emscripten_webgl_init_context_attributes, _emscripten_is_main_runtime_thread, _emscripten_dom_pk_code_to_string, _emscripten_builtin_memcpy, ___memset, _emscripten_builtin_memset, _memset, _sqrt, _fabs, _waitid, _times, _getdate, _stime, _clock_getcpuclockid, _getpwnam, ____errno_location, _getpwnam_r, _getpwuid_r, _setpwent, _endpwent, _getpwent, _getgrnam, _getgrgid, _getgrnam_r, _getgrgid_r, _getgrent, _endgrent, _setgrent, _flock, _chroot, _execve, _vfork, _posix_spawn, _popen, _pclose, _setgroups, _sigaltstack, ___dlsym, ___dl_seterr, _getloadavg, ___syscall_uname, ___syscall_setpgid, ___syscall_sync, ___syscall_getsid, ___syscall_getpgid, ___syscall_getpid, ___syscall_getppid, ___syscall_linkat, ___syscall_getgroups32, ___syscall_setsid, ___syscall_umask, ___syscall_getrusage, ___syscall_getpriority, ___syscall_setpriority, ___syscall_setdomainname, ___syscall_getuid32, ___syscall_getgid32, ___syscall_geteuid32, ___syscall_getegid32, ___syscall_getresuid32, ___syscall_getresgid32, ___syscall_pause, ___syscall_madvise, ___syscall_mlock, ___syscall_munlock, ___syscall_mprotect, ___syscall_mremap, ___syscall_mlockall, ___syscall_munlockall, ___syscall_prlimit64, ___syscall_setsockopt, ___syscall_acct, ___syscall_mincore, ___syscall_pipe2, ___syscall_pselect6, ___syscall_recvmmsg, ___syscall_sendmmsg, ___syscall_shutdown, ___syscall_socketpair, ___syscall_wait4, ___cxa_atexit, ___cxa_finalize, ___cos, ___cosdf, ___emscripten_environ_constructor, ___fdopen, _fdopen, ___fmodeflags, ___fpclassifyl, ___lockfile, ___unlockfile, ___math_divzerof, ___math_invalidf, ___math_oflow, ___math_oflowf, ___math_uflow, ___math_uflowf, ___math_xflow, ___math_xflowf, ___overflow, ___rem_pio2, ___rem_pio2_large, ___rem_pio2f, ___sin, ___sindf, ___stdio_close, ___aio_close, ___stdio_exit, ___stdio_exit_needed, ___stdio_read, ___stdio_seek, ___stdio_write, ___tan, ___tandf, ___toread, ___toread_needs_stdio_exit, ___towrite, ___towrite_needs_stdio_exit, ___tm_to_tzname, _tzset, ___uflow, ___syscall_ret, _sqrtf, _fabsf, ___env_rm_add, ___clock_gettime, ___wasi_syscall_ret, ___wasi_timestamp_to_timespec, ___clock_nanosleep, _clock_nanosleep, _copysignl, _floor, ___dl_invalid_handle, ___get_tp, ___dl_thread_cleanup, ___dl_vseterr, ___libc_free, ___libc_malloc, _emscripten_get_heap_size, __emscripten_memcpy_bulkmem, __emscripten_memset_bulkmem, ___syscall_munmap, ___syscall_msync, ___syscall_mmap2, ___time, ___gettimeofday, _dysize, _vwarn, _vwarnx, _verr, _verrx, _warn, _fprintf, _perror, _putc, _err, _errx, _fabsl, ___unlist_locked_file, ___ofl_lock, ___ofl_unlock, _feof_unlocked, __IO_feof_unlocked, _ferror_unlocked, __IO_ferror_unlocked, _fflush_unlocked, _emscripten_futex_wake, ___floatscan, _fmodl, ___lseek, ___ofl_add, _vfiprintf, ___small_fprintf, ___small_vfprintf, _fputs_unlocked, _fread_unlocked, _frexp, ___fseeko_unlocked, ___fseeko, ___fstat, ___fstatat, _fstatat, ___ftello_unlocked, ___ftello, ___fwritex, _fwrite_unlocked, ___strchrnul, _emscripten_builtin_malloc, _emscripten_stack_get_end, _emscripten_stack_get_base, ___h_errno_location, _htonl, ___inet_aton, _inet_aton, ___intscan, ___isalnum_l, _isalnum_l, ___isblank_l, _isblank_l, ___iscntrl_l, _iscntrl_l, ___ispunct_l, _ispunct_l, ___isxdigit_l, _isxdigit_l, _emscripten_has_threading_support, _emscripten_num_logical_cores, _emscripten_futex_wait, _emscripten_main_thread_process_queued_calls, _emscripten_current_thread_process_queued_calls, __emscripten_yield, __emscripten_check_timers, _pthread_mutex_init, ___pthread_mutex_lock, ___pthread_mutex_unlock, ___pthread_mutex_trylock, ___pthread_mutex_timedlock, _pthread_mutex_destroy, _pthread_mutex_consistent, _pthread_barrier_init, _pthread_barrier_destroy, _pthread_barrier_wait, ___pthread_create, ___pthread_join, ___pthread_key_create, ___pthread_key_delete, _pthread_getspecific, _pthread_setspecific, ___pthread_once, _pthread_cond_wait, _pthread_cond_signal, ___private_cond_signal, _pthread_cond_broadcast, _pthread_cond_init, _pthread_cond_destroy, ___pthread_cond_timedwait, _pthread_atfork, _pthread_cancel, _pthread_testcancel, ___pthread_exit, ___pthread_detach, _pthread_equal, _pthread_mutexattr_init, _pthread_mutexattr_setprotocol, _pthread_mutexattr_settype, _pthread_mutexattr_destroy, _pthread_mutexattr_setpshared, _pthread_condattr_init, _pthread_condattr_destroy, _pthread_condattr_setclock, _pthread_condattr_setpshared, _pthread_setcancelstate, _pthread_setcanceltype, _pthread_rwlock_init, _pthread_rwlock_destroy, _pthread_rwlock_rdlock, _pthread_rwlock_tryrdlock, _pthread_rwlock_timedrdlock, _pthread_rwlock_wrlock, _pthread_rwlock_trywrlock, _pthread_rwlock_timedwrlock, _pthread_rwlock_unlock, _pthread_rwlockattr_init, _pthread_rwlockattr_destroy, _pthread_rwlockattr_setpshared, _pthread_spin_init, _pthread_spin_destroy, _pthread_spin_lock, _pthread_spin_trylock, _pthread_spin_unlock, _sem_init, _sem_post, _sem_wait, _sem_trywait, _sem_destroy, ___wait, ___lock, ___unlock, ___acquire_ptc, ___release_ptc, _emscripten_thread_sleep, _pthread_mutex_lock, _pthread_mutex_unlock, _pthread_mutex_trylock, _pthread_mutex_timedlock, _emscripten_builtin_pthread_create, _pthread_create, _emscripten_builtin_pthread_join, _pthread_join, _pthread_key_delete, _pthread_key_create, _pthread_once, _pthread_cond_timedwait, _emscripten_builtin_pthread_exit, _pthread_exit, _emscripten_builtin_pthread_detach, _pthread_detach, _thrd_detach, ___get_locale, ___localtime_r, ___lookup_name, _mbrtowc, _mbsinit, ___memrchr, _memrchr, _timegm, ___gmtime_r, _gmtime_r, _localtime_r, _emscripten_builtin_free, _emscripten_builtin_memalign, _printf, _emscripten_main_runtime_thread_id, __IO_putc, ___putenv, _putenv, ___qsort_r, _qsort_r, _scalbnl, _unsetenv, ___shlim, ___shgetc, ___sigaction, _bsd_signal, ___sysv_signal, _sprintf, _vsiprintf, ___small_sprintf, ___small_vsprintf, ___isoc99_sscanf, ___stpcpy, _stpcpy, ___stpncpy, _stpncpy, ___strcasecmp_l, _strcasecmp_l, _strchrnul, ___strerror_l, _strerror_l, _strnlen, ___strncasecmp_l, _strncasecmp_l, _strtof, ___trunctfsf2, ___extendsftf2, ___floatsitf, ___multf3, ___addtf3, ___extenddftf2, ___getf2, ___netf2, ___floatunsitf, ___subtf3, ___divtf3, ___eqtf2, ___letf2, ___trunctfdf2, _strtold, ___multi3, _strtoimax, _strtoumax, ___strtol_internal, ___strtoul_internal, ___strtoll_internal, ___strtoull_internal, ___strtoimax_internal, ___strtoumax_internal, ___tolower_l, _tolower_l, ___toupper_l, _toupper_l, _towlower, _towupper, ___towupper_l, ___towlower_l, _towupper_l, _towlower_l, ___vfprintf_internal, _wctomb, _vfscanf, ___isoc99_vfscanf, _vsniprintf, ___small_vsnprintf, ___isoc99_vsscanf, ___wasi_fd_is_valid, _wcrtomb, _wcschr, _wmemcmp, _wmemchr, _sbrk, _emscripten_builtin_realloc, _emscripten_builtin_calloc, ___libc_calloc, ___libc_realloc, _realloc_in_place, _memalign, _posix_memalign, _valloc, _pvalloc, _mallinfo, _mallopt, _malloc_trim, _malloc_usable_size, _malloc_footprint, _malloc_max_footprint, _malloc_footprint_limit, _malloc_set_footprint_limit, _independent_calloc, _independent_comalloc, _bulk_free, _emscripten_get_sbrk_ptr, __sbrk64, _brk, ___ashlti3, ___lshrti3, ___fe_getround, ___fe_raise_inexact, ___unordtf2, ___lttf2, ___gttf2, _setThrew, ___get_temp_ret, ___set_temp_ret, _emscripten_stack_init, _emscripten_stack_set_limits, _emscripten_stack_get_free, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, _gethostbyname2, _gethostbyname2_r, memory, ___stack_pointer, _Fs, ___THREW__, ___threwValue, __indirect_function_table, _thrd_drv, _thrd_pwd, _stderr, _aiwnios_logo, _arg_bootstrap_bin, _arg_cmd_line, _arg_cmd_line2, _arg_help, _arg_overwrite, _arg_t_dir, _arg_asan_enable, _arg_new_boot_dir, _arg_fork, _arg_pidfile, _arg_grab, _arg_no_debug, _sixty_fps, _arg_boot_files, _arg_s, _arg_fast_fail, _stdout, _sdl_window_grab_enable, _user_ev_num, _glbl_table, _opterr, _optind, _optarg, _optopt, _optreset, _stdin, _EMSCRIPTENAUDIO_bootstrap, _DISKAUDIO_bootstrap, _DUMMYAUDIO_bootstrap, _SDL_Convert_S8_to_F32, _SDL_Convert_U8_to_F32, _SDL_Convert_S16_to_F32, _SDL_Convert_U16_to_F32, _SDL_Convert_S32_to_F32, _SDL_Convert_F32_to_S8, _SDL_Convert_F32_to_U8, _SDL_Convert_F32_to_S16, _SDL_Convert_F32_to_U16, _SDL_Convert_F32_to_S32, _SDL_GeneratedBlitFuncTable, _SDL_DUMMY_SensorDriver, _Emscripten_bootstrap, _SDL_EMSCRIPTEN_JoystickDriver, _SDL_joystick_magic, _SDL_expand_byte, _GLES2_RenderDriver, _SW_RenderDriver, ___environ, ____environ, __environ, _environ, ___tls_base, ___stdin_used, ___stdout_used, ___stderr_used, _timezone, _daylight, ___tzname, ___timezone, ___daylight, ___utc, _tzname, ___c_dot_utf8, ___c_locale, ___c_dot_utf8_locale, ___default_stacksize, ___default_guardsize, ___progname, ___stderr_FILE, ___exp_data, ___exp2f_data, ___libc, _h_errno, ___fsmu8, ___hwcap, ___locale_lock, ___locale_lockptr, ___logf_data, ___stdio_ofl_lockptr, ___powf_log2_data, ___stdout_FILE, ___progname_full, _program_invocation_short_name, _program_invocation_name, ___stack_high, ___stack_low, ___sig_actions, ___stdin_FILE, ___heap_base, ___dso_handle, ___data_end, ___global_base, ___heap_end, ___memory_base, ___table_base, ___wasm_first_page_end, wasmMemory, wasmTable;

function assignWasmExports(wasmExports) {
    _TaskExit = Module["_TaskExit"] = wasmExports["qe"];
    _TaskInit = Module["_TaskInit"] = wasmExports["re"];
    _HeapCtrlInit = Module["_HeapCtrlInit"] = wasmExports["se"];
    ___AIWNIOS_MAlloc = Module["___AIWNIOS_MAlloc"] = wasmExports["te"];
    _QueInit = Module["_QueInit"] = wasmExports["ue"];
    _QueIns = Module["_QueIns"] = wasmExports["ve"];
    _HashTableNew = Module["_HashTableNew"] = wasmExports["we"];
    _QueRem = Module["_QueRem"] = wasmExports["ye"];
    _QueCnt = Module["_QueCnt"] = wasmExports["ze"];
    _QueDel = Module["_QueDel"] = wasmExports["Ae"];
    ___AIWNIOS_Free = Module["___AIWNIOS_Free"] = wasmExports["Be"];
    _DebuggerClientSetGreg = Module["_DebuggerClientSetGreg"] = wasmExports["Ce"];
    _DebuggerClientStart = Module["_DebuggerClientStart"] = wasmExports["De"];
    _AiwnBCDbgCurContext = Module["_AiwnBCDbgCurContext"] = wasmExports["Ee"];
    _DebuggerClientEnd = Module["_DebuggerClientEnd"] = wasmExports["Fe"];
    _DebuggerClientWatchThisTID = Module["_DebuggerClientWatchThisTID"] = wasmExports["Ge"];
    _DebuggerBegin = Module["_DebuggerBegin"] = wasmExports["He"];
    _InstallDbgSignalsForThread = Module["_InstallDbgSignalsForThread"] = wasmExports["Ie"];
    ___enter_try = Module["___enter_try"] = wasmExports["Je"];
    ___throw = Module["___throw"] = wasmExports["Ke"];
    _AIWNIOS_ExitCatch = Module["_AIWNIOS_ExitCatch"] = wasmExports["Le"];
    _HashFind = Module["_HashFind"] = wasmExports["Me"];
    _FFI_CALL_TOS_1 = Module["_FFI_CALL_TOS_1"] = wasmExports["Ne"];
    _AIWNIOS_throw = Module["_AIWNIOS_throw"] = wasmExports["Oe"];
    _AIWNIOS_enter_try = Module["_AIWNIOS_enter_try"] = wasmExports["Pe"];
    ___wasm_setjmp_test = Module["___wasm_setjmp_test"] = wasmExports["Se"];
    _setTempRet0 = Module["_setTempRet0"] = wasmExports["Te"];
    _getTempRet0 = Module["_getTempRet0"] = wasmExports["Ue"];
    _emscripten_longjmp = Module["_emscripten_longjmp"] = wasmExports["Ve"];
    ___wasm_setjmp = Module["___wasm_setjmp"] = wasmExports["We"];
    _GenFFIBinding = Module["_GenFFIBinding"] = wasmExports["Ye"];
    _BCGenerateFFICall = Module["_BCGenerateFFICall"] = wasmExports["Ze"];
    _GenFFIBindingNaked = Module["_GenFFIBindingNaked"] = wasmExports["_e"];
    _FileRead = Module["_FileRead"] = wasmExports["$e"];
    _open = Module["_open"] = wasmExports["af"];
    ___AIWNIOS_CAlloc = Module["___AIWNIOS_CAlloc"] = wasmExports["bf"];
    _fstat = Module["_fstat"] = wasmExports["cf"];
    _read = Module["_read"] = wasmExports["df"];
    _close = Module["_close"] = wasmExports["ef"];
    _VFsThrdInit = Module["_VFsThrdInit"] = wasmExports["ff"];
    _VFsSetDrv = Module["_VFsSetDrv"] = wasmExports["jf"];
    _toupper = Module["_toupper"] = wasmExports["kf"];
    _VFsFOpen = Module["_VFsFOpen"] = wasmExports["lf"];
    _strlen = Module["_strlen"] = wasmExports["mf"];
    _strdup = Module["_strdup"] = wasmExports["nf"];
    _VFsFClose = Module["_VFsFClose"] = wasmExports["of"];
    _VFsDel = Module["_VFsDel"] = wasmExports["pf"];
    _access = Module["_access"] = wasmExports["qf"];
    _stat = Module["_stat"] = wasmExports["rf"];
    _remove = Module["_remove"] = wasmExports["sf"];
    _opendir = Module["_opendir"] = wasmExports["tf"];
    _readdir = Module["_readdir"] = wasmExports["uf"];
    _strcpy = Module["_strcpy"] = wasmExports["vf"];
    _closedir = Module["_closedir"] = wasmExports["wf"];
    _rmdir = Module["_rmdir"] = wasmExports["xf"];
    _VFsUnixTime = Module["_VFsUnixTime"] = wasmExports["yf"];
    _VFsDir = Module["_VFsDir"] = wasmExports["zf"];
    _rewinddir = Module["_rewinddir"] = wasmExports["Af"];
    ___AIWNIOS_StrDup = Module["___AIWNIOS_StrDup"] = wasmExports["Bf"];
    _VFsFSize = Module["_VFsFSize"] = wasmExports["Cf"];
    _VFsFileWrite = Module["_VFsFileWrite"] = wasmExports["Df"];
    _write = Module["_write"] = wasmExports["Ef"];
    _VFsIsDir = Module["_VFsIsDir"] = wasmExports["Ff"];
    _VFsFileRead = Module["_VFsFileRead"] = wasmExports["Gf"];
    _VFsFileExists = Module["_VFsFileExists"] = wasmExports["Hf"];
    _VFsMountDrive = Module["_VFsMountDrive"] = wasmExports["If"];
    _VFsFBlkRead = Module["_VFsFBlkRead"] = wasmExports["Jf"];
    _VFsFBlkWrite = Module["_VFsFBlkWrite"] = wasmExports["Kf"];
    _VFsFSeek = Module["_VFsFSeek"] = wasmExports["Lf"];
    _lseek = Module["_lseek"] = wasmExports["Mf"];
    _VFsTrunc = Module["_VFsTrunc"] = wasmExports["Nf"];
    _truncate = Module["_truncate"] = wasmExports["Of"];
    _VFsSetPwd = Module["_VFsSetPwd"] = wasmExports["Pf"];
    _VFsDirMk = Module["_VFsDirMk"] = wasmExports["Qf"];
    _mkdir = Module["_mkdir"] = wasmExports["Rf"];
    _CreateTemplateBootDrv = Module["_CreateTemplateBootDrv"] = wasmExports["Sf"];
    _snprintf = Module["_snprintf"] = wasmExports["Tf"];
    _fputs = Module["_fputs"] = wasmExports["Vf"];
    _siprintf = Module["_siprintf"] = wasmExports["Wf"];
    _rename = Module["_rename"] = wasmExports["Xf"];
    _fwrite = Module["_fwrite"] = wasmExports["Yf"];
    _strchr = Module["_strchr"] = wasmExports["Zf"];
    _strcat = Module["_strcat"] = wasmExports["_f"];
    _fopen = Module["_fopen"] = wasmExports["$f"];
    _fclose = Module["_fclose"] = wasmExports["ag"];
    _fread = Module["_fread"] = wasmExports["bg"];
    _ResolveBootDir = Module["_ResolveBootDir"] = wasmExports["cg"];
    _iprintf = Module["_iprintf"] = wasmExports["dg"];
    _localtime = Module["_localtime"] = wasmExports["eg"];
    _mktime = Module["_mktime"] = wasmExports["fg"];
    _HashStr = Module["_HashStr"] = wasmExports["gg"];
    _HashDel = Module["_HashDel"] = wasmExports["hg"];
    _strcmp = Module["_strcmp"] = wasmExports["ig"];
    _HashSingleTableFind = Module["_HashSingleTableFind"] = wasmExports["jg"];
    _HashBucketFind = Module["_HashBucketFind"] = wasmExports["kg"];
    _HashAdd = Module["_HashAdd"] = wasmExports["lg"];
    _HashRemDel = Module["_HashRemDel"] = wasmExports["mg"];
    _HashTableDel = Module["_HashTableDel"] = wasmExports["ng"];
    _TermSetKbCb = Module["_TermSetKbCb"] = wasmExports["og"];
    _AiwniosTUIEnable = Module["_AiwniosTUIEnable"] = wasmExports["pg"];
    _TermSize = Module["_TermSize"] = wasmExports["qg"];
    _TermSetMsCb = Module["_TermSetMsCb"] = wasmExports["rg"];
    _TUIInputLoop = Module["_TUIInputLoop"] = wasmExports["sg"];
    _LexSrcLink = Module["_LexSrcLink"] = wasmExports["tg"];
    _LexAdvChr = Module["_LexAdvChr"] = wasmExports["ug"];
    _Lex = Module["_Lex"] = wasmExports["vg"];
    _CmpCtrlNew = Module["_CmpCtrlNew"] = wasmExports["wg"];
    _CodeCtrlPush = Module["_CodeCtrlPush"] = wasmExports["xg"];
    _ParseExpr = Module["_ParseExpr"] = wasmExports["yg"];
    _Compile = Module["_Compile"] = wasmExports["zg"];
    _FFI_CALL_TOS_0 = Module["_FFI_CALL_TOS_0"] = wasmExports["Ag"];
    _CodeCtrlPop = Module["_CodeCtrlPop"] = wasmExports["Bg"];
    _CmpCtrlDel = Module["_CmpCtrlDel"] = wasmExports["Cg"];
    _strrchr = Module["_strrchr"] = wasmExports["Dg"];
    _fseek = Module["_fseek"] = wasmExports["Eg"];
    _ftell = Module["_ftell"] = wasmExports["Fg"];
    _log10 = Module["_log10"] = wasmExports["Gg"];
    _pow = Module["_pow"] = wasmExports["Hg"];
    _vsprintf = Module["_vsprintf"] = wasmExports["Ig"];
    _fiprintf = Module["_fiprintf"] = wasmExports["Jg"];
    _isxdigit = Module["_isxdigit"] = wasmExports["Kg"];
    _LexerNew = Module["_LexerNew"] = wasmExports["Lg"];
    _LexerDel = Module["_LexerDel"] = wasmExports["Mg"];
    _HeapCtrlDel = Module["_HeapCtrlDel"] = wasmExports["Ng"];
    _LexerDump = Module["_LexerDump"] = wasmExports["Og"];
    _putchar = Module["_putchar"] = wasmExports["Pg"];
    ___small_printf = Module["___small_printf"] = wasmExports["Qg"];
    _Load = Module["_Load"] = wasmExports["Sg"];
    _ImportSymbolsToHolyC = Module["_ImportSymbolsToHolyC"] = wasmExports["Tg"];
    _FFI_CALL_TOS_2 = Module["_FFI_CALL_TOS_2"] = wasmExports["Ug"];
    _LoadMainsWasm = Module["_LoadMainsWasm"] = wasmExports["Vg"];
    _FFI_CALL_TOS_0_FEW_INSTS = Module["_FFI_CALL_TOS_0_FEW_INSTS"] = wasmExports["Wg"];
    _lzw_decompress = Module["_lzw_decompress"] = wasmExports["Xg"];
    _UnixNow = Module["_UnixNow"] = wasmExports["Yg"];
    _time = Module["_time"] = wasmExports["Zg"];
    _getstkptr = Module["_getstkptr"] = wasmExports["_g"];
    _setstkptr = Module["_setstkptr"] = wasmExports["$g"];
    _IsCmdLineMode = Module["_IsCmdLineMode"] = wasmExports["ah"];
    _IsCmdLineMode2 = Module["_IsCmdLineMode2"] = wasmExports["dh"];
    _STK_TermSize = Module["_STK_TermSize"] = wasmExports["fh"];
    _CmdLineBootFiles = Module["_CmdLineBootFiles"] = wasmExports["gh"];
    _CmdLineBootFileCnt = Module["_CmdLineBootFileCnt"] = wasmExports["hh"];
    _IsFastFail = Module["_IsFastFail"] = wasmExports["ih"];
    _STK_IsFastFail = Module["_STK_IsFastFail"] = wasmExports["jh"];
    _main = Module["_main"] = wasmExports["kh"];
    _SDL_SetMainReady = Module["_SDL_SetMainReady"] = wasmExports["lh"];
    _setlocale = Module["_setlocale"] = wasmExports["mh"];
    _atexit = Module["_atexit"] = wasmExports["nh"];
    _getrlimit = Module["_getrlimit"] = wasmExports["oh"];
    _setrlimit = Module["_setrlimit"] = wasmExports["ph"];
    ___bootstrap_tls = Module["___bootstrap_tls"] = wasmExports["qh"];
    _arg_lit0 = Module["_arg_lit0"] = wasmExports["rh"];
    _arg_file0 = Module["_arg_file0"] = wasmExports["uh"];
    _arg_filen = Module["_arg_filen"] = wasmExports["Dh"];
    _arg_end = Module["_arg_end"] = wasmExports["Hh"];
    _arg_parse = Module["_arg_parse"] = wasmExports["Ih"];
    _arg_print_errors = Module["_arg_print_errors"] = wasmExports["Kh"];
    _puts = Module["_puts"] = wasmExports["Lh"];
    _arg_print_glossary = Module["_arg_print_glossary"] = wasmExports["Mh"];
    _fork = Module["_fork"] = wasmExports["Oh"];
    _setsid = Module["_setsid"] = wasmExports["Ph"];
    _signal = Module["_signal"] = wasmExports["Qh"];
    _ftruncate = Module["_ftruncate"] = wasmExports["Rh"];
    _getpid = Module["_getpid"] = wasmExports["Sh"];
    _umask = Module["_umask"] = wasmExports["Th"];
    _InitBoundsChecker = Module["_InitBoundsChecker"] = wasmExports["Uh"];
    _getuid = Module["_getuid"] = wasmExports["Vh"];
    _getpwuid = Module["_getpwuid"] = wasmExports["Wh"];
    _InitSound = Module["_InitSound"] = wasmExports["Xh"];
    _SDL_Init = Module["_SDL_Init"] = wasmExports["Yh"];
    _SDL_RegisterEvents = Module["_SDL_RegisterEvents"] = wasmExports["Zh"];
    _DrawWindowNew = Module["_DrawWindowNew"] = wasmExports["$h"];
    _DeinitVideo = Module["_DeinitVideo"] = wasmExports["ai"];
    _DeinitSound = Module["_DeinitSound"] = wasmExports["bi"];
    _SDL_Quit = Module["_SDL_Quit"] = wasmExports["ci"];
    _arg_freetable = Module["_arg_freetable"] = wasmExports["di"];
    _SDL_GetError = Module["_SDL_GetError"] = wasmExports["ei"];
    _calloc = Module["_calloc"] = wasmExports["fi"];
    _PrsStmt = Module["_PrsStmt"] = wasmExports["hi"];
    _PrsBindCSymbol = Module["_PrsBindCSymbol"] = wasmExports["ii"];
    _ScreenUpdateInProgress = Module["_ScreenUpdateInProgress"] = wasmExports["ji"];
    _AiwnBCMakeContext = Module["_AiwnBCMakeContext"] = wasmExports["ki"];
    _AiwnBCTaskContextSetRIP = Module["_AiwnBCTaskContextSetRIP"] = wasmExports["li"];
    _AiwnBCTaskContextGetRIP = Module["_AiwnBCTaskContextGetRIP"] = wasmExports["mi"];
    _AiwnBCTaskContextGetRBP = Module["_AiwnBCTaskContextGetRBP"] = wasmExports["ni"];
    _AiwnBC_FP = Module["_AiwnBC_FP"] = wasmExports["oi"];
    _PrsBindCSymbolNaked = Module["_PrsBindCSymbolNaked"] = wasmExports["pi"];
    _AiwnBCContextGet = Module["_AiwnBCContextGet"] = wasmExports["qi"];
    _AiwnBCContextSet = Module["_AiwnBCContextSet"] = wasmExports["ri"];
    _CompileBC = Module["_CompileBC"] = wasmExports["si"];
    _ABCStateDel = Module["_ABCStateDel"] = wasmExports["ti"];
    _ABCStateNew = Module["_ABCStateNew"] = wasmExports["ui"];
    _ABCRun = Module["_ABCRun"] = wasmExports["vi"];
    _AiwnBCDel = Module["_AiwnBCDel"] = wasmExports["wi"];
    _ICFwd = Module["_ICFwd"] = wasmExports["xi"];
    _DolDocDumpIR = Module["_DolDocDumpIR"] = wasmExports["yi"];
    _AiwniosSetVolume = Module["_AiwniosSetVolume"] = wasmExports["zi"];
    _AiwniosGetVolume = Module["_AiwniosGetVolume"] = wasmExports["Ai"];
    ___HC_ICAdd_Min_F64 = Module["___HC_ICAdd_Min_F64"] = wasmExports["Bi"];
    ___HC_ICAdd_Max_F64 = Module["___HC_ICAdd_Max_F64"] = wasmExports["Ci"];
    ___HC_ICAdd_Min_I64 = Module["___HC_ICAdd_Min_I64"] = wasmExports["Di"];
    ___HC_ICAdd_Max_I64 = Module["___HC_ICAdd_Max_I64"] = wasmExports["Ei"];
    ___HC_ICAdd_Min_U64 = Module["___HC_ICAdd_Min_U64"] = wasmExports["Fi"];
    ___HC_ICAdd_Max_U64 = Module["___HC_ICAdd_Max_U64"] = wasmExports["Gi"];
    _ic_readline = Module["_ic_readline"] = wasmExports["Hi"];
    _MPSetProfilerInt = Module["_MPSetProfilerInt"] = wasmExports["Ii"];
    _BoundsCheck = Module["_BoundsCheck"] = wasmExports["Ji"];
    ___HC_ICAdd_RawBytes = Module["___HC_ICAdd_RawBytes"] = wasmExports["Ki"];
    ___HC_SetAOTRelocBeforeRIP = Module["___HC_SetAOTRelocBeforeRIP"] = wasmExports["Li"];
    ___HC_CodeMiscIsUsed = Module["___HC_CodeMiscIsUsed"] = wasmExports["Mi"];
    _SDL_SetClipboardText = Module["_SDL_SetClipboardText"] = wasmExports["Ni"];
    _SDL_HasClipboardText = Module["_SDL_HasClipboardText"] = wasmExports["Oi"];
    _SDL_GetClipboardText = Module["_SDL_GetClipboardText"] = wasmExports["Pi"];
    _SDL_free = Module["_SDL_free"] = wasmExports["Qi"];
    _cos = Module["_cos"] = wasmExports["Ri"];
    _sin = Module["_sin"] = wasmExports["Si"];
    _tan = Module["_tan"] = wasmExports["Ti"];
    _atan2 = Module["_atan2"] = wasmExports["Ui"];
    _acos = Module["_acos"] = wasmExports["Vi"];
    _asin = Module["_asin"] = wasmExports["Wi"];
    _atan = Module["_atan"] = wasmExports["Xi"];
    _exp = Module["_exp"] = wasmExports["Yi"];
    _Btc = Module["_Btc"] = wasmExports["Zi"];
    ___HC_ICSetLock = Module["___HC_ICSetLock"] = wasmExports["_i"];
    _MSize = Module["_MSize"] = wasmExports["$i"];
    _MPSleepHP = Module["_MPSleepHP"] = wasmExports["aj"];
    _clock_gettime = Module["_clock_gettime"] = wasmExports["bj"];
    _strstr = Module["_strstr"] = wasmExports["cj"];
    _strcasestr = Module["_strcasestr"] = wasmExports["dj"];
    _strncmp = Module["_strncmp"] = wasmExports["ej"];
    _strcasecmp = Module["_strcasecmp"] = wasmExports["fj"];
    _strncasecmp = Module["_strncasecmp"] = wasmExports["gj"];
    _log2 = Module["_log2"] = wasmExports["hj"];
    _round = Module["_round"] = wasmExports["ij"];
    _log = Module["_log"] = wasmExports["jj"];
    _Bt = Module["_Bt"] = wasmExports["kj"];
    _LBtc = Module["_LBtc"] = wasmExports["lj"];
    _LBts = Module["_LBts"] = wasmExports["mj"];
    _LBtr = Module["_LBtr"] = wasmExports["nj"];
    _Bts = Module["_Bts"] = wasmExports["oj"];
    _Btr = Module["_Btr"] = wasmExports["pj"];
    _fflush = Module["_fflush"] = wasmExports["qj"];
    _SetHolyFs = Module["_SetHolyFs"] = wasmExports["rj"];
    _GetHolyFs = Module["_GetHolyFs"] = wasmExports["sj"];
    _WriteProtectMemCpy = Module["_WriteProtectMemCpy"] = wasmExports["tj"];
    _SpawnCore = Module["_SpawnCore"] = wasmExports["uj"];
    _MPAwake = Module["_MPAwake"] = wasmExports["vj"];
    _mp_cnt = Module["_mp_cnt"] = wasmExports["wj"];
    _GetHolyGs = Module["_GetHolyGs"] = wasmExports["xj"];
    _SetHolyGs = Module["_SetHolyGs"] = wasmExports["yj"];
    _BCAwake = Module["_BCAwake"] = wasmExports["zj"];
    _AiwnBCCall = Module["_AiwnBCCall"] = wasmExports["Aj"];
    _AiwnBCCallArgs = Module["_AiwnBCCallArgs"] = wasmExports["Bj"];
    ___HC_ICAdd_ToBool = Module["___HC_ICAdd_ToBool"] = wasmExports["Cj"];
    ___HC_ICAdd_GetVargsPtr = Module["___HC_ICAdd_GetVargsPtr"] = wasmExports["Dj"];
    ___HC_CmpCtrl_SetAOT = Module["___HC_CmpCtrl_SetAOT"] = wasmExports["Ej"];
    ___HC_ICAdd_Typecast = Module["___HC_ICAdd_Typecast"] = wasmExports["Fj"];
    ___HC_ICAdd_SubCall = Module["___HC_ICAdd_SubCall"] = wasmExports["Gj"];
    ___HC_ICAdd_SubProlog = Module["___HC_ICAdd_SubProlog"] = wasmExports["Hj"];
    ___HC_ICAdd_SubRet = Module["___HC_ICAdd_SubRet"] = wasmExports["Ij"];
    ___HC_ICAdd_Switch = Module["___HC_ICAdd_Switch"] = wasmExports["Jj"];
    ___HC_ICAdd_UnboundedSwitch = Module["___HC_ICAdd_UnboundedSwitch"] = wasmExports["Kj"];
    ___HC_ICAdd_PreInc = Module["___HC_ICAdd_PreInc"] = wasmExports["Lj"];
    ___HC_ICAdd_Call = Module["___HC_ICAdd_Call"] = wasmExports["Mj"];
    ___HC_ICAdd_F64 = Module["___HC_ICAdd_F64"] = wasmExports["Nj"];
    ___HC_ICAdd_I64 = Module["___HC_ICAdd_I64"] = wasmExports["Oj"];
    ___HC_ICAdd_PreDec = Module["___HC_ICAdd_PreDec"] = wasmExports["Pj"];
    ___HC_ICAdd_PostDec = Module["___HC_ICAdd_PostDec"] = wasmExports["Qj"];
    ___HC_ICAdd_PostInc = Module["___HC_ICAdd_PostInc"] = wasmExports["Rj"];
    ___HC_ICAdd_Pow = Module["___HC_ICAdd_Pow"] = wasmExports["Sj"];
    ___HC_ICAdd_Eq = Module["___HC_ICAdd_Eq"] = wasmExports["Tj"];
    ___HC_ICAdd_Div = Module["___HC_ICAdd_Div"] = wasmExports["Uj"];
    ___HC_ICAdd_Sub = Module["___HC_ICAdd_Sub"] = wasmExports["Vj"];
    ___HC_ICAdd_Mul = Module["___HC_ICAdd_Mul"] = wasmExports["Wj"];
    ___HC_ICAdd_Add = Module["___HC_ICAdd_Add"] = wasmExports["Xj"];
    ___HC_ICAdd_Deref = Module["___HC_ICAdd_Deref"] = wasmExports["Yj"];
    ___HC_ICAdd_Comma = Module["___HC_ICAdd_Comma"] = wasmExports["Zj"];
    ___HC_ICAdd_Addr = Module["___HC_ICAdd_Addr"] = wasmExports["_j"];
    ___HC_ICAdd_Xor = Module["___HC_ICAdd_Xor"] = wasmExports["$j"];
    ___HC_ICAdd_Mod = Module["___HC_ICAdd_Mod"] = wasmExports["ak"];
    ___HC_ICAdd_Or = Module["___HC_ICAdd_Or"] = wasmExports["bk"];
    ___HC_ICAdd_Lt = Module["___HC_ICAdd_Lt"] = wasmExports["ck"];
    ___HC_ICAdd_Gt = Module["___HC_ICAdd_Gt"] = wasmExports["dk"];
    ___HC_ICAdd_Le = Module["___HC_ICAdd_Le"] = wasmExports["ek"];
    ___HC_ICAdd_Ge = Module["___HC_ICAdd_Ge"] = wasmExports["fk"];
    ___HC_ICAdd_LNot = Module["___HC_ICAdd_LNot"] = wasmExports["gk"];
    ___HC_ICAdd_Vargs = Module["___HC_ICAdd_Vargs"] = wasmExports["hk"];
    ___HC_ICAdd_BNot = Module["___HC_ICAdd_BNot"] = wasmExports["ik"];
    ___HC_ICAdd_AndAnd = Module["___HC_ICAdd_AndAnd"] = wasmExports["jk"];
    ___HC_ICAdd_OrOr = Module["___HC_ICAdd_OrOr"] = wasmExports["kk"];
    ___HC_ICAdd_XorXor = Module["___HC_ICAdd_XorXor"] = wasmExports["lk"];
    ___HC_ICAdd_Ne = Module["___HC_ICAdd_Ne"] = wasmExports["mk"];
    ___HC_ICAdd_Lsh = Module["___HC_ICAdd_Lsh"] = wasmExports["nk"];
    ___HC_ICAdd_Rsh = Module["___HC_ICAdd_Rsh"] = wasmExports["ok"];
    ___HC_ICAdd_AddEq = Module["___HC_ICAdd_AddEq"] = wasmExports["pk"];
    ___HC_ICAdd_SubEq = Module["___HC_ICAdd_SubEq"] = wasmExports["qk"];
    ___HC_ICAdd_MulEq = Module["___HC_ICAdd_MulEq"] = wasmExports["rk"];
    ___HC_ICAdd_DivEq = Module["___HC_ICAdd_DivEq"] = wasmExports["sk"];
    ___HC_ICAdd_LshEq = Module["___HC_ICAdd_LshEq"] = wasmExports["tk"];
    ___HC_ICAdd_RshEq = Module["___HC_ICAdd_RshEq"] = wasmExports["uk"];
    ___HC_ICAdd_AndEq = Module["___HC_ICAdd_AndEq"] = wasmExports["vk"];
    ___HC_ICAdd_OrEq = Module["___HC_ICAdd_OrEq"] = wasmExports["wk"];
    ___HC_ICAdd_XorEq = Module["___HC_ICAdd_XorEq"] = wasmExports["xk"];
    ___HC_ICAdd_ModEq = Module["___HC_ICAdd_ModEq"] = wasmExports["yk"];
    ___HC_ICAdd_FReg = Module["___HC_ICAdd_FReg"] = wasmExports["zk"];
    ___HC_ICAdd_IReg = Module["___HC_ICAdd_IReg"] = wasmExports["Ak"];
    ___HC_ICAdd_Frame = Module["___HC_ICAdd_Frame"] = wasmExports["Bk"];
    ___HC_CodeMiscStrNew = Module["___HC_CodeMiscStrNew"] = wasmExports["Ck"];
    ___HC_CodeMiscLabelNew = Module["___HC_CodeMiscLabelNew"] = wasmExports["Dk"];
    ___HC_CmpCtrlNew = Module["___HC_CmpCtrlNew"] = wasmExports["Ek"];
    ___HC_CodeCtrlPush = Module["___HC_CodeCtrlPush"] = wasmExports["Fk"];
    ___HC_CodeCtrlPop = Module["___HC_CodeCtrlPop"] = wasmExports["Gk"];
    ___HC_Compile = Module["___HC_Compile"] = wasmExports["Hk"];
    ___HC_CodeMiscJmpTableNew = Module["___HC_CodeMiscJmpTableNew"] = wasmExports["Ik"];
    ___HC_ICAdd_Label = Module["___HC_ICAdd_Label"] = wasmExports["Jk"];
    ___HC_ICAdd_Goto = Module["___HC_ICAdd_Goto"] = wasmExports["Kk"];
    ___HC_ICAdd_GotoIf = Module["___HC_ICAdd_GotoIf"] = wasmExports["Lk"];
    ___HC_ICAdd_Str = Module["___HC_ICAdd_Str"] = wasmExports["Mk"];
    ___HC_ICAdd_And = Module["___HC_ICAdd_And"] = wasmExports["Nk"];
    ___HC_ICAdd_Lock = Module["___HC_ICAdd_Lock"] = wasmExports["Ok"];
    ___HC_ICAdd_Fs = Module["___HC_ICAdd_Fs"] = wasmExports["Pk"];
    ___HC_ICAdd_Gs = Module["___HC_ICAdd_Gs"] = wasmExports["Qk"];
    ___HC_ICAdd_EqEq = Module["___HC_ICAdd_EqEq"] = wasmExports["Rk"];
    ___HC_ICAdd_Neg = Module["___HC_ICAdd_Neg"] = wasmExports["Sk"];
    ___HC_ICAdd_Ret = Module["___HC_ICAdd_Ret"] = wasmExports["Tk"];
    ___HC_ICAdd_Arg = Module["___HC_ICAdd_Arg"] = wasmExports["Uk"];
    ___HC_ICAdd_SetFrameSize = Module["___HC_ICAdd_SetFrameSize"] = wasmExports["Vk"];
    ___HC_ICAdd_Reloc = Module["___HC_ICAdd_Reloc"] = wasmExports["Wk"];
    ___HC_ICAdd_RelocUnqiue = Module["___HC_ICAdd_RelocUnqiue"] = wasmExports["Xk"];
    ___HC_ICSetLine = Module["___HC_ICSetLine"] = wasmExports["Yk"];
    ___HC_ICAdd_StaticRef = Module["___HC_ICAdd_StaticRef"] = wasmExports["Zk"];
    ___HC_ICAdd_StaticData = Module["___HC_ICAdd_StaticData"] = wasmExports["_k"];
    ___HC_ICAdd_SetStaticsSize = Module["___HC_ICAdd_SetStaticsSize"] = wasmExports["$k"];
    ___HC_ICAdd_ToI64 = Module["___HC_ICAdd_ToI64"] = wasmExports["al"];
    ___HC_ICAdd_ToF64 = Module["___HC_ICAdd_ToF64"] = wasmExports["bl"];
    ___HC_ICAdd_ShortAddr = Module["___HC_ICAdd_ShortAddr"] = wasmExports["cl"];
    ___HC_CodeMiscInterateThroughRefs = Module["___HC_CodeMiscInterateThroughRefs"] = wasmExports["dl"];
    ___HC_ICAdd_BT = Module["___HC_ICAdd_BT"] = wasmExports["el"];
    ___HC_ICAdd_BTS = Module["___HC_ICAdd_BTS"] = wasmExports["fl"];
    ___HC_ICAdd_BTR = Module["___HC_ICAdd_BTR"] = wasmExports["gl"];
    ___HC_ICAdd_BTC = Module["___HC_ICAdd_BTC"] = wasmExports["hl"];
    ___HC_ICAdd_LBTS = Module["___HC_ICAdd_LBTS"] = wasmExports["il"];
    ___HC_ICAdd_LBTR = Module["___HC_ICAdd_LBTR"] = wasmExports["jl"];
    ___HC_ICAdd_LBTC = Module["___HC_ICAdd_LBTC"] = wasmExports["kl"];
    _GrPaletteColorSet = Module["_GrPaletteColorSet"] = wasmExports["ll"];
    _UpdateScreen = Module["_UpdateScreen"] = wasmExports["ml"];
    _SetKBCallback = Module["_SetKBCallback"] = wasmExports["nl"];
    _SndFreq = Module["_SndFreq"] = wasmExports["ol"];
    ___HC_ICAdd_Sqrt = Module["___HC_ICAdd_Sqrt"] = wasmExports["pl"];
    ___HC_ICAdd_Sqr = Module["___HC_ICAdd_Sqr"] = wasmExports["ql"];
    _SetMSCallback = Module["_SetMSCallback"] = wasmExports["rl"];
    _InteruptCore = Module["_InteruptCore"] = wasmExports["sl"];
    _SDL_GetTicks = Module["_SDL_GetTicks"] = wasmExports["tl"];
    _SDL_PushEvent = Module["_SDL_PushEvent"] = wasmExports["ul"];
    _NetSocketNew = Module["_NetSocketNew"] = wasmExports["vl"];
    _NetUDPAddrNew = Module["_NetUDPAddrNew"] = wasmExports["wl"];
    _NetUDPSocketNew = Module["_NetUDPSocketNew"] = wasmExports["xl"];
    _NetUDPRecvFrom = Module["_NetUDPRecvFrom"] = wasmExports["yl"];
    _NetUDPSendTo = Module["_NetUDPSendTo"] = wasmExports["zl"];
    _NetUDPAddrDel = Module["_NetUDPAddrDel"] = wasmExports["Al"];
    _NetIP4ByHost = Module["_NetIP4ByHost"] = wasmExports["Bl"];
    _NetBindIn = Module["_NetBindIn"] = wasmExports["Cl"];
    _NetListen = Module["_NetListen"] = wasmExports["Dl"];
    _NetAccept = Module["_NetAccept"] = wasmExports["El"];
    _NetClose = Module["_NetClose"] = wasmExports["Fl"];
    _NetRead = Module["_NetRead"] = wasmExports["Gl"];
    _NetWrite = Module["_NetWrite"] = wasmExports["Hl"];
    _NetPollForHangup = Module["_NetPollForHangup"] = wasmExports["Il"];
    _NetPollForRead = Module["_NetPollForRead"] = wasmExports["Jl"];
    _NetPollForWrite = Module["_NetPollForWrite"] = wasmExports["Kl"];
    _NetAddrDel = Module["_NetAddrDel"] = wasmExports["Ll"];
    _NetAddrNew = Module["_NetAddrNew"] = wasmExports["Ml"];
    _NetConnect = Module["_NetConnect"] = wasmExports["Nl"];
    _SetCaptureMouse = Module["_SetCaptureMouse"] = wasmExports["Ol"];
    _EMInputLoopRun = Module["_EMInputLoopRun"] = wasmExports["Pl"];
    _malloc = wasmExports["Ql"];
    _IsValidPtr = Module["_IsValidPtr"] = wasmExports["Rl"];
    _sysconf = Module["_sysconf"] = wasmExports["Sl"];
    _msync = Module["_msync"] = wasmExports["Tl"];
    _MemGetWritePtr = Module["_MemGetWritePtr"] = wasmExports["Ul"];
    _MemGetExecPtr = Module["_MemGetExecPtr"] = wasmExports["Vl"];
    _WhichFun = Module["_WhichFun"] = wasmExports["Wl"];
    _DoNothing = Module["_DoNothing"] = wasmExports["Xl"];
    _BCInterupt = Module["_BCInterupt"] = wasmExports["Yl"];
    _OptPassFixFunArgs = Module["_OptPassFixFunArgs"] = wasmExports["Zl"];
    _AssignRawTypeToNode = Module["_AssignRawTypeToNode"] = wasmExports["_l"];
    _ICArgN = Module["_ICArgN"] = wasmExports["$l"];
    _OptPassExpandPtrs = Module["_OptPassExpandPtrs"] = wasmExports["am"];
    _ICFree = Module["_ICFree"] = wasmExports["bm"];
    _OptPassMergeCommunitives = Module["_OptPassMergeCommunitives"] = wasmExports["cm"];
    _OptPassConstFold = Module["_OptPassConstFold"] = wasmExports["dm"];
    _abort = Module["_abort"] = wasmExports["em"];
    _fmod = Module["_fmod"] = wasmExports["fm"];
    _OptPassRegAlloc = Module["_OptPassRegAlloc"] = wasmExports["gm"];
    _qsort = Module["_qsort"] = wasmExports["hm"];
    _OptPassRemoveUselessArith = Module["_OptPassRemoveUselessArith"] = wasmExports["im"];
    _OptPassFinal = Module["_OptPassFinal"] = wasmExports["jm"];
    _OptPassFinalBC = Module["_OptPassFinalBC"] = wasmExports["km"];
    _CodeCtrlPopNoFree = Module["_CodeCtrlPopNoFree"] = wasmExports["lm"];
    _CodeCtrlAppend = Module["_CodeCtrlAppend"] = wasmExports["mm"];
    _CodeCtrlDel = Module["_CodeCtrlDel"] = wasmExports["nm"];
    _CodeMiscNew = Module["_CodeMiscNew"] = wasmExports["om"];
    _ParserDumpIR = Module["_ParserDumpIR"] = wasmExports["pm"];
    _vsnprintf = Module["_vsnprintf"] = wasmExports["qm"];
    _MemberFind = Module["_MemberFind"] = wasmExports["rm"];
    _SysSymImportsResolve = Module["_SysSymImportsResolve"] = wasmExports["sm"];
    _PrsType = Module["_PrsType"] = wasmExports["tm"];
    _ParseErr = Module["_ParseErr"] = wasmExports["um"];
    _ParseWarn = Module["_ParseWarn"] = wasmExports["vm"];
    _PrsArrayDim = Module["_PrsArrayDim"] = wasmExports["wm"];
    _PrsFunArgs = Module["_PrsFunArgs"] = wasmExports["xm"];
    _PrsKw = Module["_PrsKw"] = wasmExports["ym"];
    _PrsGoto = Module["_PrsGoto"] = wasmExports["zm"];
    __PrsStmt = Module["__PrsStmt"] = wasmExports["Am"];
    _PrsTry = Module["_PrsTry"] = wasmExports["Bm"];
    _PrsReturn = Module["_PrsReturn"] = wasmExports["Cm"];
    _PrsScope = Module["_PrsScope"] = wasmExports["Dm"];
    _PrsIf = Module["_PrsIf"] = wasmExports["Em"];
    _PrsFor = Module["_PrsFor"] = wasmExports["Fm"];
    _PrsSwitch = Module["_PrsSwitch"] = wasmExports["Gm"];
    _PrsWhile = Module["_PrsWhile"] = wasmExports["Hm"];
    _PrsDo = Module["_PrsDo"] = wasmExports["Im"];
    _PrsClass = Module["_PrsClass"] = wasmExports["Jm"];
    _PrsDecl = Module["_PrsDecl"] = wasmExports["Km"];
    _PrsI64 = Module["_PrsI64"] = wasmExports["Lm"];
    _PrsF64 = Module["_PrsF64"] = wasmExports["Mm"];
    _PrsArray = Module["_PrsArray"] = wasmExports["Nm"];
    _PrsClassNew = Module["_PrsClassNew"] = wasmExports["Om"];
    _AddRelocMisc = Module["_AddRelocMisc"] = wasmExports["Pm"];
    _CodeMiscAddRef = Module["_CodeMiscAddRef"] = wasmExports["Qm"];
    _CacheRPNArgs = Module["_CacheRPNArgs"] = wasmExports["Rm"];
    _inet_ntoa = Module["_inet_ntoa"] = wasmExports["Sm"];
    _freeaddrinfo = Module["_freeaddrinfo"] = wasmExports["Tm"];
    _inet_addr = Module["_inet_addr"] = wasmExports["Um"];
    _socket = Module["_socket"] = wasmExports["Vm"];
    _BigEndianIPAddrByHostname = Module["_BigEndianIPAddrByHostname"] = wasmExports["Wm"];
    _connect = Module["_connect"] = wasmExports["Xm"];
    _bind = Module["_bind"] = wasmExports["Ym"];
    _listen = Module["_listen"] = wasmExports["Zm"];
    _accept = Module["_accept"] = wasmExports["_m"];
    _shutdown = Module["_shutdown"] = wasmExports["$m"];
    _poll = Module["_poll"] = wasmExports["an"];
    _recvfrom = Module["_recvfrom"] = wasmExports["bn"];
    _ntohs = wasmExports["cn"];
    _gethostbyname = Module["_gethostbyname"] = wasmExports["dn"];
    _htons = wasmExports["en"];
    _sendto = Module["_sendto"] = wasmExports["fn"];
    _SDL_PauseAudioDevice = Module["_SDL_PauseAudioDevice"] = wasmExports["gn"];
    _SDL_OpenAudioDevice = Module["_SDL_OpenAudioDevice"] = wasmExports["hn"];
    _SDL_CloseAudioDevice = Module["_SDL_CloseAudioDevice"] = wasmExports["jn"];
    _AiwnRunBC = Module["_AiwnRunBC"] = wasmExports["kn"];
    _SDL_GetTicks64 = Module["_SDL_GetTicks64"] = wasmExports["ln"];
    _AiwnBCAddMem = Module["_AiwnBCAddMem"] = wasmExports["mn"];
    _ABCRun_Done = Module["_ABCRun_Done"] = wasmExports["nn"];
    _FFI_CALL_TOS_3 = Module["_FFI_CALL_TOS_3"] = wasmExports["on"];
    _FFI_CALL_TOS_4 = Module["_FFI_CALL_TOS_4"] = wasmExports["pn"];
    _FFI_CALL_TOS_CUSTOM_BP = Module["_FFI_CALL_TOS_CUSTOM_BP"] = wasmExports["qn"];
    _AiwnBCDbgFault = Module["_AiwnBCDbgFault"] = wasmExports["rn"];
    _SDL_LockMutex = Module["_SDL_LockMutex"] = wasmExports["sn"];
    _SDL_DestroyRenderer = Module["_SDL_DestroyRenderer"] = wasmExports["tn"];
    _SDL_DestroyWindow = Module["_SDL_DestroyWindow"] = wasmExports["un"];
    _SDL_LockSurface = Module["_SDL_LockSurface"] = wasmExports["vn"];
    _SDL_UnlockSurface = Module["_SDL_UnlockSurface"] = wasmExports["wn"];
    _SDL_RenderClear = Module["_SDL_RenderClear"] = wasmExports["xn"];
    _SDL_GetWindowSize = Module["_SDL_GetWindowSize"] = wasmExports["yn"];
    _SDL_CreateTextureFromSurface = Module["_SDL_CreateTextureFromSurface"] = wasmExports["zn"];
    _SDL_ShowSimpleMessageBox = Module["_SDL_ShowSimpleMessageBox"] = wasmExports["An"];
    _SDL_RenderCopy = Module["_SDL_RenderCopy"] = wasmExports["Bn"];
    _SDL_RenderPresent = Module["_SDL_RenderPresent"] = wasmExports["Cn"];
    _SDL_DestroyTexture = Module["_SDL_DestroyTexture"] = wasmExports["Dn"];
    _SDL_SetPaletteColors = Module["_SDL_SetPaletteColors"] = wasmExports["En"];
    _SDL_AddEventWatch = Module["_SDL_AddEventWatch"] = wasmExports["Fn"];
    _SDL_GetRelativeMouseMode = Module["_SDL_GetRelativeMouseMode"] = wasmExports["Gn"];
    _InputLoop = Module["_InputLoop"] = wasmExports["Hn"];
    _SDL_WaitEvent = Module["_SDL_WaitEvent"] = wasmExports["In"];
    _SDL_PollEvent = Module["_SDL_PollEvent"] = wasmExports["Jn"];
    _WaitForSDLQuit = Module["_WaitForSDLQuit"] = wasmExports["Kn"];
    _SDL_WaitThread = Module["_SDL_WaitThread"] = wasmExports["Ln"];
    _SDL_SetRelativeMouseMode = Module["_SDL_SetRelativeMouseMode"] = wasmExports["Mn"];
    _SDL_SetWindowMouseGrab = Module["_SDL_SetWindowMouseGrab"] = wasmExports["Nn"];
    _SDL_CreateMutex = Module["_SDL_CreateMutex"] = wasmExports["On"];
    _SDL_SetHintWithPriority = Module["_SDL_SetHintWithPriority"] = wasmExports["Pn"];
    _SDL_CreateWindow = Module["_SDL_CreateWindow"] = wasmExports["Qn"];
    _SDL_SetWindowKeyboardGrab = Module["_SDL_SetWindowKeyboardGrab"] = wasmExports["Rn"];
    _SDL_CreateRGBSurface = Module["_SDL_CreateRGBSurface"] = wasmExports["Sn"];
    _SDL_SetWindowMinimumSize = Module["_SDL_SetWindowMinimumSize"] = wasmExports["Tn"];
    _SDL_ShowCursor = Module["_SDL_ShowCursor"] = wasmExports["Un"];
    _SDL_CreateRenderer = Module["_SDL_CreateRenderer"] = wasmExports["Vn"];
    _SDL_UnlockMutex = Module["_SDL_UnlockMutex"] = wasmExports["Wn"];
    _LBt = Module["_LBt"] = wasmExports["Xn"];
    _arg_dstr_create = Module["_arg_dstr_create"] = wasmExports["Yn"];
    _arg_dstr_destroy = Module["_arg_dstr_destroy"] = wasmExports["Zn"];
    _arg_dstr_reset = Module["_arg_dstr_reset"] = wasmExports["_n"];
    _arg_dstr_set = Module["_arg_dstr_set"] = wasmExports["$n"];
    _arg_dstr_cstr = Module["_arg_dstr_cstr"] = wasmExports["ao"];
    _arg_dstr_cat = Module["_arg_dstr_cat"] = wasmExports["bo"];
    _arg_dstr_catc = Module["_arg_dstr_catc"] = wasmExports["co"];
    _arg_dstr_catf = Module["_arg_dstr_catf"] = wasmExports["eo"];
    _arg_dstr_free = Module["_arg_dstr_free"] = wasmExports["fo"];
    _argtable3_xmalloc = Module["_argtable3_xmalloc"] = wasmExports["go"];
    _argtable3_xfree = Module["_argtable3_xfree"] = wasmExports["ho"];
    _arg_print_errors_ds = Module["_arg_print_errors_ds"] = wasmExports["io"];
    _arg_file1 = Module["_arg_file1"] = wasmExports["jo"];
    _arg_print_option_ds = Module["_arg_print_option_ds"] = wasmExports["ko"];
    _arg_litn = Module["_arg_litn"] = wasmExports["lo"];
    _arg_lit1 = Module["_arg_lit1"] = wasmExports["mo"];
    _dbg_printf = Module["_dbg_printf"] = wasmExports["no"];
    _arg_set_panic = Module["_arg_set_panic"] = wasmExports["oo"];
    _vfprintf = Module["_vfprintf"] = wasmExports["po"];
    _argtable3_xcalloc = Module["_argtable3_xcalloc"] = wasmExports["qo"];
    _argtable3_xrealloc = Module["_argtable3_xrealloc"] = wasmExports["ro"];
    _arg_mgsort = Module["_arg_mgsort"] = wasmExports["so"];
    _getenv = Module["_getenv"] = wasmExports["to"];
    _getopt_long = Module["_getopt_long"] = wasmExports["wo"];
    _strcspn = Module["_strcspn"] = wasmExports["zo"];
    _strncat = Module["_strncat"] = wasmExports["Ao"];
    _arg_print_option = Module["_arg_print_option"] = wasmExports["Bo"];
    _arg_print_syntax_ds = Module["_arg_print_syntax_ds"] = wasmExports["Co"];
    _arg_print_syntax = Module["_arg_print_syntax"] = wasmExports["Do"];
    _arg_print_syntaxv_ds = Module["_arg_print_syntaxv_ds"] = wasmExports["Eo"];
    _arg_print_syntaxv = Module["_arg_print_syntaxv"] = wasmExports["Fo"];
    _arg_print_glossary_ds = Module["_arg_print_glossary_ds"] = wasmExports["Go"];
    _arg_print_formatted = Module["_arg_print_formatted"] = wasmExports["Ho"];
    _arg_print_glossary_gnu_ds = Module["_arg_print_glossary_gnu_ds"] = wasmExports["Io"];
    _arg_print_glossary_gnu = Module["_arg_print_glossary_gnu"] = wasmExports["Jo"];
    _arg_nullcheck = Module["_arg_nullcheck"] = wasmExports["Ko"];
    _arg_free = Module["_arg_free"] = wasmExports["Lo"];
    _getopt = Module["_getopt"] = wasmExports["Mo"];
    _warnx = Module["_warnx"] = wasmExports["Oo"];
    _getopt_long_only = Module["_getopt_long_only"] = wasmExports["Po"];
    _ic_editline = Module["_ic_editline"] = wasmExports["Qo"];
    _term_start_raw = Module["_term_start_raw"] = wasmExports["Ro"];
    _term_write = Module["_term_write"] = wasmExports["So"];
    _term_end_raw = Module["_term_end_raw"] = wasmExports["To"];
    _sbuf_new = Module["_sbuf_new"] = wasmExports["Vo"];
    _fgetc = Module["_fgetc"] = wasmExports["Wo"];
    _sbuf_append_char = Module["_sbuf_append_char"] = wasmExports["Xo"];
    _sbuf_free_dup = Module["_sbuf_free_dup"] = wasmExports["Yo"];
    _ic_get_env = Module["_ic_get_env"] = wasmExports["Zo"];
    _ic_printf = Module["_ic_printf"] = wasmExports["_o"];
    _bbcode_vprintf = Module["_bbcode_vprintf"] = wasmExports["$o"];
    _ic_vprintf = Module["_ic_vprintf"] = wasmExports["ap"];
    _ic_print = Module["_ic_print"] = wasmExports["bp"];
    _bbcode_print = Module["_bbcode_print"] = wasmExports["cp"];
    _ic_println = Module["_ic_println"] = wasmExports["dp"];
    _bbcode_println = Module["_bbcode_println"] = wasmExports["ep"];
    _ic_style_def = Module["_ic_style_def"] = wasmExports["fp"];
    _bbcode_style_def = Module["_bbcode_style_def"] = wasmExports["gp"];
    _ic_style_open = Module["_ic_style_open"] = wasmExports["hp"];
    _bbcode_style_open = Module["_bbcode_style_open"] = wasmExports["ip"];
    _ic_style_close = Module["_ic_style_close"] = wasmExports["jp"];
    _bbcode_style_close = Module["_bbcode_style_close"] = wasmExports["kp"];
    _ic_async_stop = Module["_ic_async_stop"] = wasmExports["lp"];
    _tty_async_stop = Module["_tty_async_stop"] = wasmExports["mp"];
    _ic_get_prompt_marker = Module["_ic_get_prompt_marker"] = wasmExports["np"];
    _ic_get_continuation_prompt_marker = Module["_ic_get_continuation_prompt_marker"] = wasmExports["op"];
    _ic_set_prompt_marker = Module["_ic_set_prompt_marker"] = wasmExports["pp"];
    _mem_free = Module["_mem_free"] = wasmExports["qp"];
    _mem_strdup = Module["_mem_strdup"] = wasmExports["rp"];
    _ic_enable_multiline = Module["_ic_enable_multiline"] = wasmExports["sp"];
    _ic_enable_beep = Module["_ic_enable_beep"] = wasmExports["tp"];
    _term_enable_beep = Module["_term_enable_beep"] = wasmExports["up"];
    _ic_enable_color = Module["_ic_enable_color"] = wasmExports["vp"];
    _term_enable_color = Module["_term_enable_color"] = wasmExports["wp"];
    _ic_enable_history_duplicates = Module["_ic_enable_history_duplicates"] = wasmExports["xp"];
    _history_enable_duplicates = Module["_history_enable_duplicates"] = wasmExports["yp"];
    _ic_set_history = Module["_ic_set_history"] = wasmExports["zp"];
    _history_load_from = Module["_history_load_from"] = wasmExports["Ap"];
    _ic_history_remove_last = Module["_ic_history_remove_last"] = wasmExports["Bp"];
    _history_remove_last = Module["_history_remove_last"] = wasmExports["Cp"];
    _ic_history_add = Module["_ic_history_add"] = wasmExports["Dp"];
    _history_push = Module["_history_push"] = wasmExports["Ep"];
    _ic_history_clear = Module["_ic_history_clear"] = wasmExports["Fp"];
    _history_clear = Module["_history_clear"] = wasmExports["Gp"];
    _ic_enable_auto_tab = Module["_ic_enable_auto_tab"] = wasmExports["Hp"];
    _ic_enable_completion_preview = Module["_ic_enable_completion_preview"] = wasmExports["Ip"];
    _ic_enable_multiline_indent = Module["_ic_enable_multiline_indent"] = wasmExports["Jp"];
    _ic_enable_hint = Module["_ic_enable_hint"] = wasmExports["Kp"];
    _ic_set_hint_delay = Module["_ic_set_hint_delay"] = wasmExports["Lp"];
    _ic_set_tty_esc_delay = Module["_ic_set_tty_esc_delay"] = wasmExports["Mp"];
    _tty_set_esc_delay = Module["_tty_set_esc_delay"] = wasmExports["Np"];
    _ic_enable_highlight = Module["_ic_enable_highlight"] = wasmExports["Op"];
    _ic_enable_inline_help = Module["_ic_enable_inline_help"] = wasmExports["Pp"];
    _ic_enable_brace_matching = Module["_ic_enable_brace_matching"] = wasmExports["Qp"];
    _ic_set_matching_braces = Module["_ic_set_matching_braces"] = wasmExports["Rp"];
    _ic_strlen = Module["_ic_strlen"] = wasmExports["Sp"];
    _ic_enable_brace_insertion = Module["_ic_enable_brace_insertion"] = wasmExports["Tp"];
    _ic_set_insertion_braces = Module["_ic_set_insertion_braces"] = wasmExports["Up"];
    _ic_env_get_match_braces = Module["_ic_env_get_match_braces"] = wasmExports["Vp"];
    _ic_env_get_auto_braces = Module["_ic_env_get_auto_braces"] = wasmExports["Wp"];
    _ic_set_default_highlighter = Module["_ic_set_default_highlighter"] = wasmExports["Xp"];
    _ic_free = Module["_ic_free"] = wasmExports["Yp"];
    _ic_malloc = Module["_ic_malloc"] = wasmExports["Zp"];
    _mem_malloc = Module["_mem_malloc"] = wasmExports["_p"];
    _ic_strdup = Module["_ic_strdup"] = wasmExports["$p"];
    _ic_memcpy = Module["_ic_memcpy"] = wasmExports["aq"];
    _ic_term_init = Module["_ic_term_init"] = wasmExports["bq"];
    _ic_term_done = Module["_ic_term_done"] = wasmExports["cq"];
    _ic_term_flush = Module["_ic_term_flush"] = wasmExports["dq"];
    _term_flush = Module["_term_flush"] = wasmExports["eq"];
    _ic_term_write = Module["_ic_term_write"] = wasmExports["fq"];
    _ic_term_writeln = Module["_ic_term_writeln"] = wasmExports["gq"];
    _term_writeln = Module["_term_writeln"] = wasmExports["hq"];
    _ic_term_writef = Module["_ic_term_writef"] = wasmExports["iq"];
    _term_vwritef = Module["_term_vwritef"] = wasmExports["jq"];
    _ic_term_vwritef = Module["_ic_term_vwritef"] = wasmExports["kq"];
    _ic_term_reset = Module["_ic_term_reset"] = wasmExports["lq"];
    _term_attr_reset = Module["_term_attr_reset"] = wasmExports["mq"];
    _ic_term_style = Module["_ic_term_style"] = wasmExports["nq"];
    _bbcode_style = Module["_bbcode_style"] = wasmExports["oq"];
    _term_set_attr = Module["_term_set_attr"] = wasmExports["pq"];
    _ic_term_get_color_bits = Module["_ic_term_get_color_bits"] = wasmExports["qq"];
    _term_get_color_bits = Module["_term_get_color_bits"] = wasmExports["rq"];
    _ic_term_bold = Module["_ic_term_bold"] = wasmExports["sq"];
    _term_bold = Module["_term_bold"] = wasmExports["tq"];
    _ic_term_underline = Module["_ic_term_underline"] = wasmExports["uq"];
    _term_underline = Module["_term_underline"] = wasmExports["vq"];
    _ic_term_italic = Module["_ic_term_italic"] = wasmExports["wq"];
    _term_italic = Module["_term_italic"] = wasmExports["xq"];
    _ic_term_reverse = Module["_ic_term_reverse"] = wasmExports["yq"];
    _term_reverse = Module["_term_reverse"] = wasmExports["zq"];
    _ic_term_color_ansi = Module["_ic_term_color_ansi"] = wasmExports["Aq"];
    _color_from_ansi256 = Module["_color_from_ansi256"] = wasmExports["Bq"];
    _term_color = Module["_term_color"] = wasmExports["Cq"];
    _term_bgcolor = Module["_term_bgcolor"] = wasmExports["Dq"];
    _ic_term_color_rgb = Module["_ic_term_color_rgb"] = wasmExports["Eq"];
    _ic_rgb = Module["_ic_rgb"] = wasmExports["Fq"];
    _ic_readline_ex = Module["_ic_readline_ex"] = wasmExports["Gq"];
    _completions_get_completer = Module["_completions_get_completer"] = wasmExports["Hq"];
    _ic_set_default_completer = Module["_ic_set_default_completer"] = wasmExports["Iq"];
    _mem_zalloc = Module["_mem_zalloc"] = wasmExports["Jq"];
    _tty_new = Module["_tty_new"] = wasmExports["Kq"];
    _term_new = Module["_term_new"] = wasmExports["Lq"];
    _history_new = Module["_history_new"] = wasmExports["Mq"];
    _completions_new = Module["_completions_new"] = wasmExports["Nq"];
    _bbcode_new = Module["_bbcode_new"] = wasmExports["Oq"];
    _term_is_interactive = Module["_term_is_interactive"] = wasmExports["Pq"];
    _ic_init_custom_malloc = Module["_ic_init_custom_malloc"] = wasmExports["Qq"];
    _history_save = Module["_history_save"] = wasmExports["Rq"];
    _history_free = Module["_history_free"] = wasmExports["Sq"];
    _completions_free = Module["_completions_free"] = wasmExports["Tq"];
    _bbcode_free = Module["_bbcode_free"] = wasmExports["Uq"];
    _term_free = Module["_term_free"] = wasmExports["Vq"];
    _tty_free = Module["_tty_free"] = wasmExports["Wq"];
    _attr_none = Module["_attr_none"] = wasmExports["Xq"];
    _attr_default = Module["_attr_default"] = wasmExports["Yq"];
    _attr_is_none = Module["_attr_is_none"] = wasmExports["Zq"];
    _attr_is_eq = Module["_attr_is_eq"] = wasmExports["_q"];
    _attr_from_color = Module["_attr_from_color"] = wasmExports["$q"];
    _attr_update_with = Module["_attr_update_with"] = wasmExports["ar"];
    _attr_from_sgr = Module["_attr_from_sgr"] = wasmExports["br"];
    _attr_from_esc_sgr = Module["_attr_from_esc_sgr"] = wasmExports["cr"];
    _attrbuf_new = Module["_attrbuf_new"] = wasmExports["dr"];
    _attrbuf_free = Module["_attrbuf_free"] = wasmExports["er"];
    _attrbuf_clear = Module["_attrbuf_clear"] = wasmExports["fr"];
    _attrbuf_len = Module["_attrbuf_len"] = wasmExports["gr"];
    _attrbuf_attrs = Module["_attrbuf_attrs"] = wasmExports["hr"];
    _attrbuf_set_at = Module["_attrbuf_set_at"] = wasmExports["ir"];
    _attrbuf_update_at = Module["_attrbuf_update_at"] = wasmExports["jr"];
    _attrbuf_insert_at = Module["_attrbuf_insert_at"] = wasmExports["kr"];
    _attrbuf_append_n = Module["_attrbuf_append_n"] = wasmExports["lr"];
    _attrbuf_attr_at = Module["_attrbuf_attr_at"] = wasmExports["mr"];
    _attrbuf_delete_at = Module["_attrbuf_delete_at"] = wasmExports["nr"];
    _ic_atoz = Module["_ic_atoz"] = wasmExports["or"];
    _ic_rgbx = Module["_ic_rgbx"] = wasmExports["pr"];
    _debug_msg = Module["_debug_msg"] = wasmExports["qr"];
    _mem_realloc = Module["_mem_realloc"] = wasmExports["rr"];
    _ic_memmove = Module["_ic_memmove"] = wasmExports["sr"];
    _sbuf_len = Module["_sbuf_len"] = wasmExports["tr"];
    _sbuf_append_n = Module["_sbuf_append_n"] = wasmExports["ur"];
    _sbuf_free = Module["_sbuf_free"] = wasmExports["vr"];
    _bbcode_style_add = Module["_bbcode_style_add"] = wasmExports["wr"];
    _parse_skip_white = Module["_parse_skip_white"] = wasmExports["xr"];
    _parse_skip_to_white = Module["_parse_skip_to_white"] = wasmExports["yr"];
    _parse_skip_to_end = Module["_parse_skip_to_end"] = wasmExports["zr"];
    _parse_attr_name = Module["_parse_attr_name"] = wasmExports["Ar"];
    _parse_value = Module["_parse_value"] = wasmExports["Br"];
    _parse_tag_value = Module["_parse_tag_value"] = wasmExports["Cr"];
    _ic_strnicmp = Module["_ic_strnicmp"] = wasmExports["Dr"];
    _ic_strncpy = Module["_ic_strncpy"] = wasmExports["Er"];
    _ic_str_tolower = Module["_ic_str_tolower"] = wasmExports["Fr"];
    _term_get_attr = Module["_term_get_attr"] = wasmExports["Gr"];
    _ic_stricmp = Module["_ic_stricmp"] = wasmExports["Hr"];
    _bbcode_process_tag = Module["_bbcode_process_tag"] = wasmExports["Ir"];
    _sbuf_string = Module["_sbuf_string"] = wasmExports["Jr"];
    _str_column_width = Module["_str_column_width"] = wasmExports["Kr"];
    _str_skip_until_fit = Module["_str_skip_until_fit"] = wasmExports["Lr"];
    _sbuf_delete_at = Module["_sbuf_delete_at"] = wasmExports["Mr"];
    _sbuf_insert_at = Module["_sbuf_insert_at"] = wasmExports["Nr"];
    _str_take_while_fit = Module["_str_take_while_fit"] = wasmExports["Or"];
    _sbuf_insert_char_at = Module["_sbuf_insert_char_at"] = wasmExports["Pr"];
    _bbcode_append = Module["_bbcode_append"] = wasmExports["Qr"];
    _term_write_formatted = Module["_term_write_formatted"] = wasmExports["Rr"];
    _sbuf_clear = Module["_sbuf_clear"] = wasmExports["Sr"];
    _sbuf_append_vprintf = Module["_sbuf_append_vprintf"] = wasmExports["Tr"];
    _bbcode_printf = Module["_bbcode_printf"] = wasmExports["Ur"];
    _bbcode_column_width = Module["_bbcode_column_width"] = wasmExports["Vr"];
    _sscanf = Module["_sscanf"] = wasmExports["Wr"];
    _ic_istarts_with = Module["_ic_istarts_with"] = wasmExports["Xr"];
    _ic_memset = Module["_ic_memset"] = wasmExports["Yr"];
    _ic_memnmove = Module["_ic_memnmove"] = wasmExports["Zr"];
    _ic_strcpy = Module["_ic_strcpy"] = wasmExports["_r"];
    _strncpy = Module["_strncpy"] = wasmExports["$r"];
    _ic_starts_with = Module["_ic_starts_with"] = wasmExports["as"];
    _ic_tolower = Module["_ic_tolower"] = wasmExports["bs"];
    _ic_contains = Module["_ic_contains"] = wasmExports["cs"];
    _ic_icontains = Module["_ic_icontains"] = wasmExports["ds"];
    _unicode_from_raw = Module["_unicode_from_raw"] = wasmExports["es"];
    _unicode_is_raw = Module["_unicode_is_raw"] = wasmExports["fs"];
    _unicode_to_qutf8 = Module["_unicode_to_qutf8"] = wasmExports["gs"];
    _utf8_is_cont = Module["_utf8_is_cont"] = wasmExports["hs"];
    _unicode_from_qutf8 = Module["_unicode_from_qutf8"] = wasmExports["is"];
    _mem_strndup = Module["_mem_strndup"] = wasmExports["js"];
    _ic_complete_filename = Module["_ic_complete_filename"] = wasmExports["ks"];
    _completions_clear = Module["_completions_clear"] = wasmExports["ls"];
    _completions_count = Module["_completions_count"] = wasmExports["ms"];
    _completions_add = Module["_completions_add"] = wasmExports["ns"];
    _completions_get_display = Module["_completions_get_display"] = wasmExports["os"];
    _completions_get_help = Module["_completions_get_help"] = wasmExports["ps"];
    _completions_get_hint = Module["_completions_get_hint"] = wasmExports["qs"];
    _completions_set_completer = Module["_completions_set_completer"] = wasmExports["rs"];
    _ic_completion_arg = Module["_ic_completion_arg"] = wasmExports["ss"];
    _ic_has_completions = Module["_ic_has_completions"] = wasmExports["ts"];
    _ic_stop_completing = Module["_ic_stop_completing"] = wasmExports["us"];
    _completions_apply = Module["_completions_apply"] = wasmExports["vs"];
    _sbuf_string_at = Module["_sbuf_string_at"] = wasmExports["ws"];
    _sbuf_delete_from_to = Module["_sbuf_delete_from_to"] = wasmExports["xs"];
    _completions_sort = Module["_completions_sort"] = wasmExports["ys"];
    _completions_apply_longest_prefix = Module["_completions_apply_longest_prefix"] = wasmExports["zs"];
    _ic_add_completions = Module["_ic_add_completions"] = wasmExports["As"];
    _ic_add_completion_ex = Module["_ic_add_completion_ex"] = wasmExports["Bs"];
    _ic_add_completion = Module["_ic_add_completion"] = wasmExports["Cs"];
    _ic_add_completion_prim = Module["_ic_add_completion_prim"] = wasmExports["Ds"];
    _completions_generate = Module["_completions_generate"] = wasmExports["Es"];
    _ic_complete_word = Module["_ic_complete_word"] = wasmExports["xe"];
    _ic_complete_qword = Module["_ic_complete_qword"] = wasmExports["Gs"];
    _ic_complete_qword_ex = Module["_ic_complete_qword_ex"] = wasmExports["Hs"];
    _ic_dirsep = Module["_ic_dirsep"] = wasmExports["Is"];
    _ic_char_is_nonseparator = Module["_ic_char_is_nonseparator"] = wasmExports["Js"];
    _str_prev_ofs = Module["_str_prev_ofs"] = wasmExports["Ks"];
    _str_next_ofs = Module["_str_next_ofs"] = wasmExports["Ls"];
    _sbuf_replace = Module["_sbuf_replace"] = wasmExports["Ms"];
    _sbuf_next_ofs = Module["_sbuf_next_ofs"] = wasmExports["Ns"];
    _ic_char_is_filename_letter = Module["_ic_char_is_filename_letter"] = wasmExports["Os"];
    _sbuf_append = Module["_sbuf_append"] = wasmExports["Ps"];
    _lstat = Module["_lstat"] = wasmExports["Qs"];
    _sbuf_delete_from = Module["_sbuf_delete_from"] = wasmExports["Rs"];
    _sbuf_appendf = Module["_sbuf_appendf"] = wasmExports["Ss"];
    _tty_start_raw = Module["_tty_start_raw"] = wasmExports["Ts"];
    _term_get_width = Module["_term_get_width"] = wasmExports["Us"];
    _editstate_init = Module["_editstate_init"] = wasmExports["Vs"];
    _tty_read = Module["_tty_read"] = wasmExports["Ws"];
    _tty_read_timeout = Module["_tty_read_timeout"] = wasmExports["Xs"];
    _tty_term_resize_event = Module["_tty_term_resize_event"] = wasmExports["Ys"];
    _sbuf_get_rc_at_pos = Module["_sbuf_get_rc_at_pos"] = wasmExports["Zs"];
    _editstate_capture = Module["_editstate_capture"] = wasmExports["_s"];
    _editstate_done = Module["_editstate_done"] = wasmExports["$s"];
    _sbuf_find_word_start = Module["_sbuf_find_word_start"] = wasmExports["at"];
    _sbuf_next = Module["_sbuf_next"] = wasmExports["bt"];
    _ic_char_is_idletter = Module["_ic_char_is_idletter"] = wasmExports["ct"];
    _history_count = Module["_history_count"] = wasmExports["dt"];
    _term_beep = Module["_term_beep"] = wasmExports["et"];
    _history_update = Module["_history_update"] = wasmExports["ft"];
    _history_search = Module["_history_search"] = wasmExports["gt"];
    _history_get = Module["_history_get"] = wasmExports["ht"];
    _editstate_restore = Module["_editstate_restore"] = wasmExports["it"];
    _sbuf_delete_char_before = Module["_sbuf_delete_char_before"] = wasmExports["jt"];
    _code_is_ascii_char = Module["_code_is_ascii_char"] = wasmExports["kt"];
    _code_is_unicode = Module["_code_is_unicode"] = wasmExports["lt"];
    _sbuf_insert_unicode_at = Module["_sbuf_insert_unicode_at"] = wasmExports["mt"];
    _tty_is_utf8 = Module["_tty_is_utf8"] = wasmExports["nt"];
    _sbuf_strdup_from_utf8 = Module["_sbuf_strdup_from_utf8"] = wasmExports["ot"];
    _sbuf_strdup = Module["_sbuf_strdup"] = wasmExports["pt"];
    _sbuf_swap_char = Module["_sbuf_swap_char"] = wasmExports["qt"];
    _sbuf_find_line_start = Module["_sbuf_find_line_start"] = wasmExports["rt"];
    _sbuf_find_line_end = Module["_sbuf_find_line_end"] = wasmExports["st"];
    _sbuf_char_at = Module["_sbuf_char_at"] = wasmExports["tt"];
    _sbuf_find_ws_word_start = Module["_sbuf_find_ws_word_start"] = wasmExports["ut"];
    _sbuf_find_word_end = Module["_sbuf_find_word_end"] = wasmExports["vt"];
    _find_matching_brace = Module["_find_matching_brace"] = wasmExports["wt"];
    _sbuf_get_pos_at_rc = Module["_sbuf_get_pos_at_rc"] = wasmExports["xt"];
    _sbuf_prev = Module["_sbuf_prev"] = wasmExports["yt"];
    _term_get_height = Module["_term_get_height"] = wasmExports["zt"];
    _term_up = Module["_term_up"] = wasmExports["At"];
    _term_clear_line = Module["_term_clear_line"] = wasmExports["kj"];
    _tty_end_raw = Module["_tty_end_raw"] = wasmExports["Ct"];
    _sbuf_append_tagged = Module["_sbuf_append_tagged"] = wasmExports["Dt"];
    _term_write_repeat = Module["_term_write_repeat"] = wasmExports["Et"];
    _highlight = Module["_highlight"] = wasmExports["Ft"];
    _highlight_match_braces = Module["_highlight_match_braces"] = wasmExports["Gt"];
    _term_set_buffer_mode = Module["_term_set_buffer_mode"] = wasmExports["Ht"];
    _term_start_of_line = Module["_term_start_of_line"] = wasmExports["It"];
    _sbuf_for_each_row = Module["_sbuf_for_each_row"] = wasmExports["Jt"];
    _term_right = Module["_term_right"] = wasmExports["Kt"];
    _term_update_dim = Module["_term_update_dim"] = wasmExports["Lt"];
    _sbuf_get_wrapped_rc_at_pos = Module["_sbuf_get_wrapped_rc_at_pos"] = wasmExports["Mt"];
    _tty_code_pushback = Module["_tty_code_pushback"] = wasmExports["Nt"];
    _code_is_virt_key = Module["_code_is_virt_key"] = wasmExports["Ot"];
    _sbuf_delete_char_at = Module["_sbuf_delete_char_at"] = wasmExports["Pt"];
    _term_write_n = Module["_term_write_n"] = wasmExports["Qt"];
    _term_write_formatted_n = Module["_term_write_formatted_n"] = wasmExports["Rt"];
    _term_clear_to_end_of_line = Module["_term_clear_to_end_of_line"] = wasmExports["St"];
    _ic_highlight = Module["_ic_highlight"] = wasmExports["Tt"];
    _ic_highlight_formatted = Module["_ic_highlight_formatted"] = wasmExports["Ut"];
    _history_load = Module["_history_load"] = wasmExports["Vt"];
    _feof = Module["_feof"] = wasmExports["Wt"];
    _chmod = Module["_chmod"] = wasmExports["Xt"];
    _memchr = Module["_memchr"] = wasmExports["Yt"];
    _skip_esc = Module["_skip_esc"] = wasmExports["Zt"];
    _sbuf_strdup_at = Module["_sbuf_strdup_at"] = wasmExports["_t"];
    _sbuf_insert_at_n = Module["_sbuf_insert_at_n"] = wasmExports["$t"];
    _sbuf_split_at = Module["_sbuf_split_at"] = wasmExports["au"];
    _sbuf_prev_ofs = Module["_sbuf_prev_ofs"] = wasmExports["bu"];
    _sbuf_find_ws_word_end = Module["_sbuf_find_ws_word_end"] = wasmExports["cu"];
    _ic_prev_char = Module["_ic_prev_char"] = wasmExports["du"];
    _ic_next_char = Module["_ic_next_char"] = wasmExports["eu"];
    _ic_atoz2 = Module["_ic_atoz2"] = wasmExports["fu"];
    _ic_atou32 = Module["_ic_atou32"] = wasmExports["gu"];
    _ic_char_is_white = Module["_ic_char_is_white"] = wasmExports["hu"];
    _ic_char_is_nonwhite = Module["_ic_char_is_nonwhite"] = wasmExports["iu"];
    _ic_char_is_separator = Module["_ic_char_is_separator"] = wasmExports["ju"];
    _ic_char_is_digit = Module["_ic_char_is_digit"] = wasmExports["ku"];
    _ic_char_is_hexdigit = Module["_ic_char_is_hexdigit"] = wasmExports["lu"];
    _ic_char_is_letter = Module["_ic_char_is_letter"] = wasmExports["mu"];
    _ic_is_token = Module["_ic_is_token"] = wasmExports["nu"];
    _ic_match_token = Module["_ic_match_token"] = wasmExports["ou"];
    _ic_match_any_token = Module["_ic_match_any_token"] = wasmExports["pu"];
    _rgb_remember = Module["_rgb_remember"] = wasmExports["qu"];
    _rgb_lookup = Module["_rgb_lookup"] = wasmExports["ru"];
    _term_append_color = Module["_term_append_color"] = wasmExports["su"];
    _term_append_bgcolor = Module["_term_append_bgcolor"] = wasmExports["tu"];
    _term_left = Module["_term_left"] = wasmExports["uu"];
    _term_writef = Module["_term_writef"] = wasmExports["vu"];
    _term_down = Module["_term_down"] = wasmExports["wu"];
    _term_write_char = Module["_term_write_char"] = wasmExports["xu"];
    _fputc = Module["_fputc"] = wasmExports["yu"];
    ___errno_location = Module["___errno_location"] = wasmExports["zu"];
    _isatty = Module["_isatty"] = wasmExports["Au"];
    _ioctl = Module["_ioctl"] = wasmExports["Bu"];
    _tty_read_esc_response = Module["_tty_read_esc_response"] = wasmExports["Cu"];
    _tty_read_esc = Module["_tty_read_esc"] = wasmExports["Du"];
    _tty_readc_noblock = Module["_tty_readc_noblock"] = wasmExports["Eu"];
    _tty_cpush_char = Module["_tty_cpush_char"] = wasmExports["Fu"];
    _select = Module["_select"] = wasmExports["Gu"];
    _tty_cpop = Module["_tty_cpop"] = wasmExports["Hu"];
    _tcgetattr = Module["_tcgetattr"] = wasmExports["Iu"];
    _sigemptyset = Module["_sigemptyset"] = wasmExports["Ju"];
    _sigaction = Module["_sigaction"] = wasmExports["Ku"];
    _tcsetattr = Module["_tcsetattr"] = wasmExports["Lu"];
    _SDL_ExitProcess = Module["_SDL_ExitProcess"] = wasmExports["Mu"];
    _SDL_InitMainThread = Module["_SDL_InitMainThread"] = wasmExports["Nu"];
    _SDL_InitTLSData = Module["_SDL_InitTLSData"] = wasmExports["Ou"];
    _SDL_TicksInit = Module["_SDL_TicksInit"] = wasmExports["Pu"];
    _SDL_LogInit = Module["_SDL_LogInit"] = wasmExports["Qu"];
    _SDL_InitSubSystem = Module["_SDL_InitSubSystem"] = wasmExports["Ru"];
    _SDL_ClearError = Module["_SDL_ClearError"] = wasmExports["Su"];
    _SDL_EventsInit = Module["_SDL_EventsInit"] = wasmExports["Tu"];
    _SDL_TimerInit = Module["_SDL_TimerInit"] = wasmExports["Uu"];
    _SDL_VideoInit = Module["_SDL_VideoInit"] = wasmExports["Vu"];
    _SDL_AudioInit = Module["_SDL_AudioInit"] = wasmExports["Wu"];
    _SDL_JoystickInit = Module["_SDL_JoystickInit"] = wasmExports["Xu"];
    _SDL_GameControllerInit = Module["_SDL_GameControllerInit"] = wasmExports["Yu"];
    _SDL_SetError = Module["_SDL_SetError"] = wasmExports["Zu"];
    _SDL_SensorInit = Module["_SDL_SensorInit"] = wasmExports["_u"];
    _SDL_QuitSubSystem = Module["_SDL_QuitSubSystem"] = wasmExports["$u"];
    _SDL_SensorQuit = Module["_SDL_SensorQuit"] = wasmExports["av"];
    _SDL_GameControllerQuit = Module["_SDL_GameControllerQuit"] = wasmExports["bv"];
    _SDL_JoystickQuit = Module["_SDL_JoystickQuit"] = wasmExports["cv"];
    _SDL_EventsQuit = Module["_SDL_EventsQuit"] = wasmExports["dv"];
    _SDL_AudioQuit = Module["_SDL_AudioQuit"] = wasmExports["ev"];
    _SDL_VideoQuit = Module["_SDL_VideoQuit"] = wasmExports["fv"];
    _SDL_TimerQuit = Module["_SDL_TimerQuit"] = wasmExports["gv"];
    _SDL_WasInit = Module["_SDL_WasInit"] = wasmExports["hv"];
    _SDL_ClearHints = Module["_SDL_ClearHints"] = wasmExports["iv"];
    _SDL_AssertionsQuit = Module["_SDL_AssertionsQuit"] = wasmExports["jv"];
    _SDL_memset = Module["_SDL_memset"] = wasmExports["kv"];
    _SDL_LogQuit = Module["_SDL_LogQuit"] = wasmExports["lv"];
    _SDL_TicksQuit = Module["_SDL_TicksQuit"] = wasmExports["mv"];
    _SDL_QuitTLSData = Module["_SDL_QuitTLSData"] = wasmExports["nv"];
    _SDL_GetVersion = Module["_SDL_GetVersion"] = wasmExports["ov"];
    _SDL_GetHintBoolean = Module["_SDL_GetHintBoolean"] = wasmExports["pv"];
    _SDL_GetRevision = Module["_SDL_GetRevision"] = wasmExports["qv"];
    _SDL_GetRevisionNumber = Module["_SDL_GetRevisionNumber"] = wasmExports["rv"];
    _SDL_GetPlatform = Module["_SDL_GetPlatform"] = wasmExports["sv"];
    _SDL_IsTablet = Module["_SDL_IsTablet"] = wasmExports["tv"];
    _SDL_RLESurface = Module["_SDL_RLESurface"] = wasmExports["uv"];
    _SDL_UnRLESurface = Module["_SDL_UnRLESurface"] = wasmExports["vv"];
    _SDL_ReportAssertion = Module["_SDL_ReportAssertion"] = wasmExports["wv"];
    _SDL_SetAssertionHandler = Module["_SDL_SetAssertionHandler"] = wasmExports["xv"];
    _SDL_snprintf = Module["_SDL_snprintf"] = wasmExports["yv"];
    _SDL_malloc = Module["_SDL_malloc"] = wasmExports["zv"];
    _SDL_getenv = Module["_SDL_getenv"] = wasmExports["Av"];
    _SDL_strcmp = Module["_SDL_strcmp"] = wasmExports["Bv"];
    _SDL_GetFocusWindow = Module["_SDL_GetFocusWindow"] = wasmExports["Cv"];
    _SDL_GetWindowFlags = Module["_SDL_GetWindowFlags"] = wasmExports["Dv"];
    _SDL_MinimizeWindow = Module["_SDL_MinimizeWindow"] = wasmExports["Ev"];
    _SDL_ShowMessageBox = Module["_SDL_ShowMessageBox"] = wasmExports["Fv"];
    _SDL_RestoreWindow = Module["_SDL_RestoreWindow"] = wasmExports["Gv"];
    _SDL_GetAssertionReport = Module["_SDL_GetAssertionReport"] = wasmExports["Hv"];
    _SDL_ResetAssertionReport = Module["_SDL_ResetAssertionReport"] = wasmExports["Iv"];
    _SDL_GetDefaultAssertionHandler = Module["_SDL_GetDefaultAssertionHandler"] = wasmExports["Jv"];
    _SDL_GetAssertionHandler = Module["_SDL_GetAssertionHandler"] = wasmExports["Kv"];
    _SDL_LogMessageV = Module["_SDL_LogMessageV"] = wasmExports["Lv"];
    _SDL_AtomicCAS = Module["_SDL_AtomicCAS"] = wasmExports["Mv"];
    _SDL_AtomicCASPtr = Module["_SDL_AtomicCASPtr"] = wasmExports["Nv"];
    _SDL_AtomicSet = Module["_SDL_AtomicSet"] = wasmExports["Ov"];
    _SDL_AtomicSetPtr = Module["_SDL_AtomicSetPtr"] = wasmExports["Pv"];
    _SDL_AtomicAdd = Module["_SDL_AtomicAdd"] = wasmExports["Qv"];
    _SDL_AtomicGet = Module["_SDL_AtomicGet"] = wasmExports["Rv"];
    _SDL_AtomicGetPtr = Module["_SDL_AtomicGetPtr"] = wasmExports["Sv"];
    _SDL_MemoryBarrierReleaseFunction = Module["_SDL_MemoryBarrierReleaseFunction"] = wasmExports["Tv"];
    _SDL_MemoryBarrierAcquireFunction = Module["_SDL_MemoryBarrierAcquireFunction"] = wasmExports["Uv"];
    _SDL_AddAudioDevice = Module["_SDL_AddAudioDevice"] = wasmExports["Vv"];
    _SDL_OpenedAudioDeviceDisconnected = Module["_SDL_OpenedAudioDeviceDisconnected"] = wasmExports["Wv"];
    _SDL_RemoveAudioDevice = Module["_SDL_RemoveAudioDevice"] = wasmExports["Xv"];
    _SDL_QueueAudio = Module["_SDL_QueueAudio"] = wasmExports["Yv"];
    _SDL_DequeueAudio = Module["_SDL_DequeueAudio"] = wasmExports["Zv"];
    _SDL_GetQueuedAudioSize = Module["_SDL_GetQueuedAudioSize"] = wasmExports["_v"];
    _SDL_ClearQueuedAudio = Module["_SDL_ClearQueuedAudio"] = wasmExports["$v"];
    _SDL_GetNumAudioDrivers = Module["_SDL_GetNumAudioDrivers"] = wasmExports["aw"];
    _SDL_GetAudioDriver = Module["_SDL_GetAudioDriver"] = wasmExports["bw"];
    _SDL_EventState = Module["_SDL_EventState"] = wasmExports["cw"];
    _SDL_AtomicLock = Module["_SDL_AtomicLock"] = wasmExports["dw"];
    _SDL_AtomicUnlock = Module["_SDL_AtomicUnlock"] = wasmExports["ew"];
    _SDL_WriteToDataQueue = Module["_SDL_WriteToDataQueue"] = wasmExports["fw"];
    _SDL_ReadFromDataQueue = Module["_SDL_ReadFromDataQueue"] = wasmExports["gw"];
    _SDL_CountDataQueue = Module["_SDL_CountDataQueue"] = wasmExports["hw"];
    _SDL_ClearDataQueue = Module["_SDL_ClearDataQueue"] = wasmExports["iw"];
    _SDL_GetHint = Module["_SDL_GetHint"] = wasmExports["jw"];
    _SDL_strchr = Module["_SDL_strchr"] = wasmExports["kw"];
    _SDL_strlen = Module["_SDL_strlen"] = wasmExports["lw"];
    _SDL_strncasecmp = Module["_SDL_strncasecmp"] = wasmExports["nw"];
    _SDL_GetCurrentAudioDriver = Module["_SDL_GetCurrentAudioDriver"] = wasmExports["qw"];
    _SDL_DestroyMutex = Module["_SDL_DestroyMutex"] = wasmExports["rw"];
    _SDL_GetNumAudioDevices = Module["_SDL_GetNumAudioDevices"] = wasmExports["sw"];
    _SDL_GetAudioDeviceName = Module["_SDL_GetAudioDeviceName"] = wasmExports["tw"];
    _SDL_GetAudioDeviceSpec = Module["_SDL_GetAudioDeviceSpec"] = wasmExports["uw"];
    _SDL_memcpy = Module["_SDL_memcpy"] = wasmExports["vw"];
    _SDL_GetDefaultAudioInfo = Module["_SDL_GetDefaultAudioInfo"] = wasmExports["ww"];
    _SDL_Error = Module["_SDL_Error"] = wasmExports["xw"];
    _SDL_OpenAudio = Module["_SDL_OpenAudio"] = wasmExports["yw"];
    _SDL_atoi = Module["_SDL_atoi"] = wasmExports["zw"];
    _SDL_calloc = Module["_SDL_calloc"] = wasmExports["Aw"];
    _SDL_powerof2 = Module["_SDL_powerof2"] = wasmExports["Bw"];
    _SDL_NewAudioStream = Module["_SDL_NewAudioStream"] = wasmExports["Cw"];
    _SDL_NewDataQueue = Module["_SDL_NewDataQueue"] = wasmExports["Dw"];
    _SDL_CreateSemaphore = Module["_SDL_CreateSemaphore"] = wasmExports["Ew"];
    _SDL_CreateThreadInternal = Module["_SDL_CreateThreadInternal"] = wasmExports["Fw"];
    _SDL_DestroySemaphore = Module["_SDL_DestroySemaphore"] = wasmExports["Gw"];
    _SDL_SemWait = Module["_SDL_SemWait"] = wasmExports["Hw"];
    _SDL_GetAudioDeviceStatus = Module["_SDL_GetAudioDeviceStatus"] = wasmExports["Iw"];
    _SDL_GetAudioStatus = Module["_SDL_GetAudioStatus"] = wasmExports["Jw"];
    _SDL_PauseAudio = Module["_SDL_PauseAudio"] = wasmExports["Kw"];
    _SDL_LockAudioDevice = Module["_SDL_LockAudioDevice"] = wasmExports["Lw"];
    _SDL_LockAudio = Module["_SDL_LockAudio"] = wasmExports["Mw"];
    _SDL_UnlockAudioDevice = Module["_SDL_UnlockAudioDevice"] = wasmExports["Nw"];
    _SDL_UnlockAudio = Module["_SDL_UnlockAudio"] = wasmExports["Ow"];
    _SDL_FreeAudioStream = Module["_SDL_FreeAudioStream"] = wasmExports["Pw"];
    _SDL_FreeDataQueue = Module["_SDL_FreeDataQueue"] = wasmExports["Qw"];
    _SDL_CloseAudio = Module["_SDL_CloseAudio"] = wasmExports["Rw"];
    _SDL_FirstAudioFormat = Module["_SDL_FirstAudioFormat"] = wasmExports["Sw"];
    _SDL_NextAudioFormat = Module["_SDL_NextAudioFormat"] = wasmExports["Tw"];
    _SDL_SilenceValueForFormat = Module["_SDL_SilenceValueForFormat"] = wasmExports["Uw"];
    _SDL_CalculateAudioSpec = Module["_SDL_CalculateAudioSpec"] = wasmExports["Vw"];
    _SDL_MixAudio = Module["_SDL_MixAudio"] = wasmExports["Ww"];
    _SDL_MixAudioFormat = Module["_SDL_MixAudioFormat"] = wasmExports["Xw"];
    _SDL_strdup = Module["_SDL_strdup"] = wasmExports["Yw"];
    _SDL_ThreadID = Module["_SDL_ThreadID"] = wasmExports["Zw"];
    _SDL_SetThreadPriority = Module["_SDL_SetThreadPriority"] = wasmExports["_w"];
    _SDL_SemPost = Module["_SDL_SemPost"] = wasmExports["$w"];
    _SDL_Delay = Module["_SDL_Delay"] = wasmExports["ax"];
    _SDL_AudioStreamClear = Module["_SDL_AudioStreamClear"] = wasmExports["bx"];
    _SDL_AudioStreamPut = Module["_SDL_AudioStreamPut"] = wasmExports["cx"];
    _SDL_AudioStreamAvailable = Module["_SDL_AudioStreamAvailable"] = wasmExports["dx"];
    _SDL_AudioStreamGet = Module["_SDL_AudioStreamGet"] = wasmExports["ex"];
    _SDL_ConvertAudio = Module["_SDL_ConvertAudio"] = wasmExports["fx"];
    _SDL_BuildAudioCVT = Module["_SDL_BuildAudioCVT"] = wasmExports["gx"];
    _SDL_ChooseAudioConverters = Module["_SDL_ChooseAudioConverters"] = wasmExports["hx"];
    _SDL_ceil = Module["_SDL_ceil"] = wasmExports["nx"];
    _SDL_realloc = Module["_SDL_realloc"] = wasmExports["tx"];
    _SDL_AudioStreamFlush = Module["_SDL_AudioStreamFlush"] = wasmExports["ux"];
    _SDL_memmove = Module["_SDL_memmove"] = wasmExports["vx"];
    _SDL_BlendFillRect = Module["_SDL_BlendFillRect"] = wasmExports["wx"];
    _SDL_BlendFillRects = Module["_SDL_BlendFillRects"] = wasmExports["xx"];
    _SDL_BlendLine = Module["_SDL_BlendLine"] = wasmExports["yx"];
    _SDL_BlendLines = Module["_SDL_BlendLines"] = wasmExports["zx"];
    _SDL_BlendPoint = Module["_SDL_BlendPoint"] = wasmExports["Ax"];
    _SDL_BlendPoints = Module["_SDL_BlendPoints"] = wasmExports["Bx"];
    _SDL_CalculateBlit = Module["_SDL_CalculateBlit"] = wasmExports["Cx"];
    _SDL_CalculateBlit0 = Module["_SDL_CalculateBlit0"] = wasmExports["Dx"];
    _SDL_CalculateBlit1 = Module["_SDL_CalculateBlit1"] = wasmExports["Ex"];
    _SDL_CalculateBlitA = Module["_SDL_CalculateBlitA"] = wasmExports["Fx"];
    _SDL_CalculateBlitN = Module["_SDL_CalculateBlitN"] = wasmExports["Gx"];
    _SDL_BlitCopy = Module["_SDL_BlitCopy"] = wasmExports["Ix"];
    _SDL_Blit_Slow = Module["_SDL_Blit_Slow"] = wasmExports["Jx"];
    _SDL_GetVideoDevice = Module["_SDL_GetVideoDevice"] = wasmExports["Kx"];
    _SDL_SetPrimarySelectionText = Module["_SDL_SetPrimarySelectionText"] = wasmExports["Lx"];
    _SDL_GetPrimarySelectionText = Module["_SDL_GetPrimarySelectionText"] = wasmExports["Mx"];
    _SDL_HasPrimarySelectionText = Module["_SDL_HasPrimarySelectionText"] = wasmExports["Nx"];
    _SDL_GetCPUCount = Module["_SDL_GetCPUCount"] = wasmExports["Ox"];
    _SDL_GetCPUCacheLineSize = Module["_SDL_GetCPUCacheLineSize"] = wasmExports["Px"];
    _SDL_HasRDTSC = Module["_SDL_HasRDTSC"] = wasmExports["Qx"];
    _SDL_HasAltiVec = Module["_SDL_HasAltiVec"] = wasmExports["Rx"];
    _SDL_HasMMX = Module["_SDL_HasMMX"] = wasmExports["Sx"];
    _SDL_Has3DNow = Module["_SDL_Has3DNow"] = wasmExports["Tx"];
    _SDL_HasSSE = Module["_SDL_HasSSE"] = wasmExports["Ux"];
    _SDL_HasSSE2 = Module["_SDL_HasSSE2"] = wasmExports["Vx"];
    _SDL_HasSSE3 = Module["_SDL_HasSSE3"] = wasmExports["Wx"];
    _SDL_HasSSE41 = Module["_SDL_HasSSE41"] = wasmExports["Xx"];
    _SDL_HasSSE42 = Module["_SDL_HasSSE42"] = wasmExports["Yx"];
    _SDL_HasAVX = Module["_SDL_HasAVX"] = wasmExports["Zx"];
    _SDL_HasAVX2 = Module["_SDL_HasAVX2"] = wasmExports["_x"];
    _SDL_HasAVX512F = Module["_SDL_HasAVX512F"] = wasmExports["$x"];
    _SDL_HasARMSIMD = Module["_SDL_HasARMSIMD"] = wasmExports["ay"];
    _SDL_HasNEON = Module["_SDL_HasNEON"] = wasmExports["by"];
    _SDL_HasLSX = Module["_SDL_HasLSX"] = wasmExports["cy"];
    _SDL_HasLASX = Module["_SDL_HasLASX"] = wasmExports["dy"];
    _SDL_GetSystemRAM = Module["_SDL_GetSystemRAM"] = wasmExports["ey"];
    _SDL_SIMDGetAlignment = Module["_SDL_SIMDGetAlignment"] = wasmExports["fy"];
    _SDL_SIMDAlloc = Module["_SDL_SIMDAlloc"] = wasmExports["gy"];
    _SDL_SIMDRealloc = Module["_SDL_SIMDRealloc"] = wasmExports["hy"];
    _SDL_SIMDFree = Module["_SDL_SIMDFree"] = wasmExports["iy"];
    _SDL_crc16 = Module["_SDL_crc16"] = wasmExports["jy"];
    _SDL_PeekIntoDataQueue = Module["_SDL_PeekIntoDataQueue"] = wasmExports["ky"];
    _SDL_GetDataQueueMutex = Module["_SDL_GetDataQueueMutex"] = wasmExports["ly"];
    _SDL_RWFromFile = Module["_SDL_RWFromFile"] = wasmExports["my"];
    _SDL_LogCritical = Module["_SDL_LogCritical"] = wasmExports["ny"];
    _SDL_RWwrite = Module["_SDL_RWwrite"] = wasmExports["oy"];
    _SDL_RWread = Module["_SDL_RWread"] = wasmExports["py"];
    _SDL_RWclose = Module["_SDL_RWclose"] = wasmExports["qy"];
    _SDL_SendDisplayEvent = Module["_SDL_SendDisplayEvent"] = wasmExports["ry"];
    _SDL_DrawLine = Module["_SDL_DrawLine"] = wasmExports["sy"];
    _SDL_DrawLines = Module["_SDL_DrawLines"] = wasmExports["ty"];
    _SDL_DrawPoint = Module["_SDL_DrawPoint"] = wasmExports["uy"];
    _SDL_DrawPoints = Module["_SDL_DrawPoints"] = wasmExports["vy"];
    _SDL_EGL_SetErrorEx = Module["_SDL_EGL_SetErrorEx"] = wasmExports["xy"];
    _SDL_EGL_HasExtension = Module["_SDL_EGL_HasExtension"] = wasmExports["yy"];
    _SDL_EGL_GetProcAddress = Module["_SDL_EGL_GetProcAddress"] = wasmExports["zy"];
    _SDL_EGL_UnloadLibrary = Module["_SDL_EGL_UnloadLibrary"] = wasmExports["Ay"];
    _SDL_EGL_LoadLibraryOnly = Module["_SDL_EGL_LoadLibraryOnly"] = wasmExports["By"];
    _SDL_EGL_LoadLibrary = Module["_SDL_EGL_LoadLibrary"] = wasmExports["Cy"];
    _SDL_EGL_InitializeOffscreen = Module["_SDL_EGL_InitializeOffscreen"] = wasmExports["Dy"];
    _SDL_EGL_SetRequiredVisualId = Module["_SDL_EGL_SetRequiredVisualId"] = wasmExports["Ey"];
    _SDL_EGL_ChooseConfig = Module["_SDL_EGL_ChooseConfig"] = wasmExports["Fy"];
    _SDL_EGL_CreateContext = Module["_SDL_EGL_CreateContext"] = wasmExports["Gy"];
    _SDL_EGL_MakeCurrent = Module["_SDL_EGL_MakeCurrent"] = wasmExports["Hy"];
    _SDL_EGL_DeleteContext = Module["_SDL_EGL_DeleteContext"] = wasmExports["Iy"];
    _SDL_EGL_SetSwapInterval = Module["_SDL_EGL_SetSwapInterval"] = wasmExports["Jy"];
    _SDL_EGL_GetSwapInterval = Module["_SDL_EGL_GetSwapInterval"] = wasmExports["Ky"];
    _SDL_EGL_SwapBuffers = Module["_SDL_EGL_SwapBuffers"] = wasmExports["Ly"];
    _SDL_EGL_CreateSurface = Module["_SDL_EGL_CreateSurface"] = wasmExports["My"];
    _SDL_EGL_CreateOffscreenSurface = Module["_SDL_EGL_CreateOffscreenSurface"] = wasmExports["Ny"];
    _SDL_EGL_DestroySurface = Module["_SDL_EGL_DestroySurface"] = wasmExports["Oy"];
    _Emscripten_HandleCanvasResize = Module["_Emscripten_HandleCanvasResize"] = wasmExports["Py"];
    _Emscripten_RegisterEventHandlers = Module["_Emscripten_RegisterEventHandlers"] = wasmExports["Qy"];
    _Emscripten_UnregisterEventHandlers = Module["_Emscripten_UnregisterEventHandlers"] = wasmExports["Ry"];
    _Emscripten_CreateWindowFramebuffer = Module["_Emscripten_CreateWindowFramebuffer"] = wasmExports["Sy"];
    _Emscripten_UpdateWindowFramebuffer = Module["_Emscripten_UpdateWindowFramebuffer"] = wasmExports["Ty"];
    _Emscripten_DestroyWindowFramebuffer = Module["_Emscripten_DestroyWindowFramebuffer"] = wasmExports["Uy"];
    _Emscripten_InitMouse = Module["_Emscripten_InitMouse"] = wasmExports["Vy"];
    _Emscripten_FiniMouse = Module["_Emscripten_FiniMouse"] = wasmExports["Wy"];
    _Emscripten_GLES_LoadLibrary = Module["_Emscripten_GLES_LoadLibrary"] = wasmExports["Xy"];
    _Emscripten_GLES_CreateContext = Module["_Emscripten_GLES_CreateContext"] = wasmExports["Yy"];
    _Emscripten_GLES_MakeCurrent = Module["_Emscripten_GLES_MakeCurrent"] = wasmExports["Zy"];
    _Emscripten_GLES_SwapWindow = Module["_Emscripten_GLES_SwapWindow"] = wasmExports["_y"];
    _SDL_GetErrBuf = Module["_SDL_GetErrBuf"] = wasmExports["az"];
    _SDL_vsnprintf = Module["_SDL_vsnprintf"] = wasmExports["bz"];
    _SDL_LogGetPriority = Module["_SDL_LogGetPriority"] = wasmExports["cz"];
    _SDL_LogDebug = Module["_SDL_LogDebug"] = wasmExports["dz"];
    _SDL_GetErrorMsg = Module["_SDL_GetErrorMsg"] = wasmExports["ez"];
    _SDL_strlcpy = Module["_SDL_strlcpy"] = wasmExports["fz"];
    _SDL_StopEventLoop = Module["_SDL_StopEventLoop"] = wasmExports["gz"];
    _SDL_StartEventLoop = Module["_SDL_StartEventLoop"] = wasmExports["hz"];
    _SDL_Log = Module["_SDL_Log"] = wasmExports["iz"];
    _SDL_FlushEvents = Module["_SDL_FlushEvents"] = wasmExports["jz"];
    _SDL_JoystickEventState = Module["_SDL_JoystickEventState"] = wasmExports["kz"];
    _SDL_ToggleDragAndDropSupport = Module["_SDL_ToggleDragAndDropSupport"] = wasmExports["lz"];
    _SDL_PeepEvents = Module["_SDL_PeepEvents"] = wasmExports["mz"];
    _SDL_HasEvent = Module["_SDL_HasEvent"] = wasmExports["nz"];
    _SDL_HasEvents = Module["_SDL_HasEvents"] = wasmExports["oz"];
    _SDL_FlushEvent = Module["_SDL_FlushEvent"] = wasmExports["pz"];
    _SDL_PumpEvents = Module["_SDL_PumpEvents"] = wasmExports["qz"];
    _SDL_ReleaseAutoReleaseKeys = Module["_SDL_ReleaseAutoReleaseKeys"] = wasmExports["rz"];
    _SDL_JoystickUpdate = Module["_SDL_JoystickUpdate"] = wasmExports["sz"];
    _SDL_SensorUpdate = Module["_SDL_SensorUpdate"] = wasmExports["tz"];
    _SDL_SendPendingSignalEvents = Module["_SDL_SendPendingSignalEvents"] = wasmExports["uz"];
    _SDL_WaitEventTimeout = Module["_SDL_WaitEventTimeout"] = wasmExports["vz"];
    _SDL_NumJoysticks = Module["_SDL_NumJoysticks"] = wasmExports["wz"];
    _SDL_NumSensors = Module["_SDL_NumSensors"] = wasmExports["xz"];
    _SDL_GestureProcessEvent = Module["_SDL_GestureProcessEvent"] = wasmExports["yz"];
    _SDL_SetEventFilter = Module["_SDL_SetEventFilter"] = wasmExports["zz"];
    _SDL_GetEventFilter = Module["_SDL_GetEventFilter"] = wasmExports["Az"];
    _SDL_DelEventWatch = Module["_SDL_DelEventWatch"] = wasmExports["Bz"];
    _SDL_FilterEvents = Module["_SDL_FilterEvents"] = wasmExports["Cz"];
    _SDL_SendAppEvent = Module["_SDL_SendAppEvent"] = wasmExports["Dz"];
    _SDL_SendSysWMEvent = Module["_SDL_SendSysWMEvent"] = wasmExports["Ez"];
    _SDL_SendKeymapChangedEvent = Module["_SDL_SendKeymapChangedEvent"] = wasmExports["Fz"];
    _SDL_SendLocaleChangedEvent = Module["_SDL_SendLocaleChangedEvent"] = wasmExports["Gz"];
    _SDL_AddHintCallback = Module["_SDL_AddHintCallback"] = wasmExports["Hz"];
    _SDL_QuitInit = Module["_SDL_QuitInit"] = wasmExports["Iz"];
    _SDL_GetStringBoolean = Module["_SDL_GetStringBoolean"] = wasmExports["Jz"];
    _SDL_QuitQuit = Module["_SDL_QuitQuit"] = wasmExports["Kz"];
    _SDL_DelHintCallback = Module["_SDL_DelHintCallback"] = wasmExports["Lz"];
    _SDL_FillRect = Module["_SDL_FillRect"] = wasmExports["Mz"];
    _SDL_FillRects = Module["_SDL_FillRects"] = wasmExports["Nz"];
    _SDL_GetGameControllerTypeFromString = Module["_SDL_GetGameControllerTypeFromString"] = wasmExports["Oz"];
    _SDL_GameControllerGetAxisFromString = Module["_SDL_GameControllerGetAxisFromString"] = wasmExports["Pz"];
    _SDL_GameControllerGetStringForAxis = Module["_SDL_GameControllerGetStringForAxis"] = wasmExports["Qz"];
    _SDL_GameControllerGetButtonFromString = Module["_SDL_GameControllerGetButtonFromString"] = wasmExports["Rz"];
    _SDL_GameControllerGetStringForButton = Module["_SDL_GameControllerGetStringForButton"] = wasmExports["Sz"];
    _SDL_GameControllerAddMappingsFromRW = Module["_SDL_GameControllerAddMappingsFromRW"] = wasmExports["Tz"];
    _SDL_GameControllerAddMapping = Module["_SDL_GameControllerAddMapping"] = wasmExports["Uz"];
    _SDL_GameControllerNumMappings = Module["_SDL_GameControllerNumMappings"] = wasmExports["Vz"];
    _SDL_GameControllerMappingForIndex = Module["_SDL_GameControllerMappingForIndex"] = wasmExports["Wz"];
    _SDL_GameControllerMappingForGUID = Module["_SDL_GameControllerMappingForGUID"] = wasmExports["Xz"];
    _SDL_GameControllerMapping = Module["_SDL_GameControllerMapping"] = wasmExports["Yz"];
    _SDL_GameControllerInitMappings = Module["_SDL_GameControllerInitMappings"] = wasmExports["Zz"];
    _SDL_strcasecmp = Module["_SDL_strcasecmp"] = wasmExports["_z"];
    _SDL_RWsize = Module["_SDL_RWsize"] = wasmExports["$z"];
    _SDL_strstr = Module["_SDL_strstr"] = wasmExports["aA"];
    _SDL_LockJoysticks = Module["_SDL_LockJoysticks"] = wasmExports["bA"];
    _SDL_UnlockJoysticks = Module["_SDL_UnlockJoysticks"] = wasmExports["cA"];
    _SDL_AssertJoysticksLocked = Module["_SDL_AssertJoysticksLocked"] = wasmExports["dA"];
    _SDL_JoystickGetGUIDFromString = Module["_SDL_JoystickGetGUIDFromString"] = wasmExports["eA"];
    _SDL_memcmp = Module["_SDL_memcmp"] = wasmExports["fA"];
    _SDL_JoystickGetGUIDString = Module["_SDL_JoystickGetGUIDString"] = wasmExports["gA"];
    _SDL_strlcat = Module["_SDL_strlcat"] = wasmExports["hA"];
    _SDL_JoystickGUIDUsesVersion = Module["_SDL_JoystickGUIDUsesVersion"] = wasmExports["iA"];
    _SDL_IsJoystickHIDAPI = Module["_SDL_IsJoystickHIDAPI"] = wasmExports["jA"];
    _SDL_GetJoystickGUIDInfo = Module["_SDL_GetJoystickGUIDInfo"] = wasmExports["kA"];
    _SDL_IsJoystickXboxSeriesX = Module["_SDL_IsJoystickXboxSeriesX"] = wasmExports["lA"];
    _SDL_IsJoystickXboxOneElite = Module["_SDL_IsJoystickXboxOneElite"] = wasmExports["mA"];
    _SDL_IsJoystickSteamController = Module["_SDL_IsJoystickSteamController"] = wasmExports["nA"];
    _SDL_IsJoystickNintendoSwitchJoyConPair = Module["_SDL_IsJoystickNintendoSwitchJoyConPair"] = wasmExports["oA"];
    _SDL_GetJoystickGameControllerTypeFromGUID = Module["_SDL_GetJoystickGameControllerTypeFromGUID"] = wasmExports["pA"];
    _SDL_IsJoystickDualSenseEdge = Module["_SDL_IsJoystickDualSenseEdge"] = wasmExports["qA"];
    _SDL_IsJoystickRAWINPUT = Module["_SDL_IsJoystickRAWINPUT"] = wasmExports["rA"];
    _SDL_IsJoystickWGI = Module["_SDL_IsJoystickWGI"] = wasmExports["sA"];
    _SDL_IsJoystickVirtual = Module["_SDL_IsJoystickVirtual"] = wasmExports["tA"];
    _SDL_PrivateJoystickValid = Module["_SDL_PrivateJoystickValid"] = wasmExports["uA"];
    _SDL_LoadVIDPIDList = Module["_SDL_LoadVIDPIDList"] = wasmExports["vA"];
    _SDL_GameControllerGetButton = Module["_SDL_GameControllerGetButton"] = wasmExports["wA"];
    _SDL_GameControllerGetAxis = Module["_SDL_GameControllerGetAxis"] = wasmExports["xA"];
    _SDL_IsGameController = Module["_SDL_IsGameController"] = wasmExports["yA"];
    _SDL_GameControllerNameForIndex = Module["_SDL_GameControllerNameForIndex"] = wasmExports["zA"];
    _SDL_JoystickNameForIndex = Module["_SDL_JoystickNameForIndex"] = wasmExports["AA"];
    _SDL_JoystickGetDeviceGUID = Module["_SDL_JoystickGetDeviceGUID"] = wasmExports["BA"];
    _SDL_PrivateJoystickGetAutoGamepadMapping = Module["_SDL_PrivateJoystickGetAutoGamepadMapping"] = wasmExports["CA"];
    _SDL_GameControllerPathForIndex = Module["_SDL_GameControllerPathForIndex"] = wasmExports["DA"];
    _SDL_JoystickPathForIndex = Module["_SDL_JoystickPathForIndex"] = wasmExports["EA"];
    _SDL_GameControllerTypeForIndex = Module["_SDL_GameControllerTypeForIndex"] = wasmExports["FA"];
    _SDL_GameControllerMappingForDeviceIndex = Module["_SDL_GameControllerMappingForDeviceIndex"] = wasmExports["GA"];
    _SDL_IsGameControllerNameAndGUID = Module["_SDL_IsGameControllerNameAndGUID"] = wasmExports["HA"];
    _SDL_ShouldIgnoreGameController = Module["_SDL_ShouldIgnoreGameController"] = wasmExports["IA"];
    _SDL_IsJoystickSteamVirtualGamepad = Module["_SDL_IsJoystickSteamVirtualGamepad"] = wasmExports["JA"];
    _SDL_VIDPIDInList = Module["_SDL_VIDPIDInList"] = wasmExports["KA"];
    _SDL_GameControllerOpen = Module["_SDL_GameControllerOpen"] = wasmExports["LA"];
    _SDL_JoystickGetDeviceInstanceID = Module["_SDL_JoystickGetDeviceInstanceID"] = wasmExports["MA"];
    _SDL_JoystickOpen = Module["_SDL_JoystickOpen"] = wasmExports["NA"];
    _SDL_JoystickClose = Module["_SDL_JoystickClose"] = wasmExports["OA"];
    _SDL_JoystickGetGUID = Module["_SDL_JoystickGetGUID"] = wasmExports["PA"];
    _SDL_JoystickName = Module["_SDL_JoystickName"] = wasmExports["QA"];
    _SDL_GameControllerUpdate = Module["_SDL_GameControllerUpdate"] = wasmExports["RA"];
    _SDL_GameControllerHasAxis = Module["_SDL_GameControllerHasAxis"] = wasmExports["SA"];
    _SDL_GameControllerGetBindForAxis = Module["_SDL_GameControllerGetBindForAxis"] = wasmExports["TA"];
    _SDL_JoystickGetAxis = Module["_SDL_JoystickGetAxis"] = wasmExports["UA"];
    _SDL_JoystickGetButton = Module["_SDL_JoystickGetButton"] = wasmExports["VA"];
    _SDL_JoystickGetHat = Module["_SDL_JoystickGetHat"] = wasmExports["WA"];
    _SDL_GameControllerHasButton = Module["_SDL_GameControllerHasButton"] = wasmExports["XA"];
    _SDL_GameControllerGetBindForButton = Module["_SDL_GameControllerGetBindForButton"] = wasmExports["YA"];
    _SDL_GameControllerGetNumTouchpads = Module["_SDL_GameControllerGetNumTouchpads"] = wasmExports["ZA"];
    _SDL_GameControllerGetJoystick = Module["_SDL_GameControllerGetJoystick"] = wasmExports["_A"];
    _SDL_GameControllerGetNumTouchpadFingers = Module["_SDL_GameControllerGetNumTouchpadFingers"] = wasmExports["$A"];
    _SDL_GameControllerGetTouchpadFinger = Module["_SDL_GameControllerGetTouchpadFinger"] = wasmExports["aB"];
    _SDL_GameControllerHasSensor = Module["_SDL_GameControllerHasSensor"] = wasmExports["bB"];
    _SDL_GameControllerSetSensorEnabled = Module["_SDL_GameControllerSetSensorEnabled"] = wasmExports["cB"];
    _SDL_GameControllerIsSensorEnabled = Module["_SDL_GameControllerIsSensorEnabled"] = wasmExports["dB"];
    _SDL_GameControllerGetSensorDataRate = Module["_SDL_GameControllerGetSensorDataRate"] = wasmExports["eB"];
    _SDL_GameControllerGetSensorData = Module["_SDL_GameControllerGetSensorData"] = wasmExports["fB"];
    _SDL_GameControllerGetSensorDataWithTimestamp = Module["_SDL_GameControllerGetSensorDataWithTimestamp"] = wasmExports["gB"];
    _SDL_GameControllerName = Module["_SDL_GameControllerName"] = wasmExports["hB"];
    _SDL_GameControllerPath = Module["_SDL_GameControllerPath"] = wasmExports["iB"];
    _SDL_JoystickPath = Module["_SDL_JoystickPath"] = wasmExports["jB"];
    _SDL_GameControllerGetType = Module["_SDL_GameControllerGetType"] = wasmExports["kB"];
    _SDL_GetJoystickInstanceVirtualGamepadInfo = Module["_SDL_GetJoystickInstanceVirtualGamepadInfo"] = wasmExports["lB"];
    _SDL_GameControllerGetPlayerIndex = Module["_SDL_GameControllerGetPlayerIndex"] = wasmExports["mB"];
    _SDL_JoystickGetPlayerIndex = Module["_SDL_JoystickGetPlayerIndex"] = wasmExports["nB"];
    _SDL_GameControllerSetPlayerIndex = Module["_SDL_GameControllerSetPlayerIndex"] = wasmExports["oB"];
    _SDL_JoystickSetPlayerIndex = Module["_SDL_JoystickSetPlayerIndex"] = wasmExports["pB"];
    _SDL_GameControllerGetVendor = Module["_SDL_GameControllerGetVendor"] = wasmExports["qB"];
    _SDL_JoystickGetVendor = Module["_SDL_JoystickGetVendor"] = wasmExports["rB"];
    _SDL_GameControllerGetProduct = Module["_SDL_GameControllerGetProduct"] = wasmExports["sB"];
    _SDL_JoystickGetProduct = Module["_SDL_JoystickGetProduct"] = wasmExports["tB"];
    _SDL_GameControllerGetProductVersion = Module["_SDL_GameControllerGetProductVersion"] = wasmExports["uB"];
    _SDL_JoystickGetProductVersion = Module["_SDL_JoystickGetProductVersion"] = wasmExports["vB"];
    _SDL_GameControllerGetFirmwareVersion = Module["_SDL_GameControllerGetFirmwareVersion"] = wasmExports["wB"];
    _SDL_JoystickGetFirmwareVersion = Module["_SDL_JoystickGetFirmwareVersion"] = wasmExports["xB"];
    _SDL_GameControllerGetSerial = Module["_SDL_GameControllerGetSerial"] = wasmExports["yB"];
    _SDL_JoystickGetSerial = Module["_SDL_JoystickGetSerial"] = wasmExports["zB"];
    _SDL_GameControllerGetSteamHandle = Module["_SDL_GameControllerGetSteamHandle"] = wasmExports["AB"];
    _SDL_GameControllerGetAttached = Module["_SDL_GameControllerGetAttached"] = wasmExports["BB"];
    _SDL_JoystickGetAttached = Module["_SDL_JoystickGetAttached"] = wasmExports["CB"];
    _SDL_GameControllerFromInstanceID = Module["_SDL_GameControllerFromInstanceID"] = wasmExports["DB"];
    _SDL_GameControllerFromPlayerIndex = Module["_SDL_GameControllerFromPlayerIndex"] = wasmExports["EB"];
    _SDL_JoystickFromPlayerIndex = Module["_SDL_JoystickFromPlayerIndex"] = wasmExports["FB"];
    _SDL_GameControllerRumble = Module["_SDL_GameControllerRumble"] = wasmExports["GB"];
    _SDL_JoystickRumble = Module["_SDL_JoystickRumble"] = wasmExports["HB"];
    _SDL_GameControllerRumbleTriggers = Module["_SDL_GameControllerRumbleTriggers"] = wasmExports["IB"];
    _SDL_JoystickRumbleTriggers = Module["_SDL_JoystickRumbleTriggers"] = wasmExports["JB"];
    _SDL_GameControllerHasLED = Module["_SDL_GameControllerHasLED"] = wasmExports["KB"];
    _SDL_JoystickHasLED = Module["_SDL_JoystickHasLED"] = wasmExports["LB"];
    _SDL_GameControllerHasRumble = Module["_SDL_GameControllerHasRumble"] = wasmExports["MB"];
    _SDL_JoystickHasRumble = Module["_SDL_JoystickHasRumble"] = wasmExports["NB"];
    _SDL_GameControllerHasRumbleTriggers = Module["_SDL_GameControllerHasRumbleTriggers"] = wasmExports["OB"];
    _SDL_JoystickHasRumbleTriggers = Module["_SDL_JoystickHasRumbleTriggers"] = wasmExports["PB"];
    _SDL_GameControllerSetLED = Module["_SDL_GameControllerSetLED"] = wasmExports["QB"];
    _SDL_JoystickSetLED = Module["_SDL_JoystickSetLED"] = wasmExports["RB"];
    _SDL_GameControllerSendEffect = Module["_SDL_GameControllerSendEffect"] = wasmExports["SB"];
    _SDL_JoystickSendEffect = Module["_SDL_JoystickSendEffect"] = wasmExports["TB"];
    _SDL_GameControllerClose = Module["_SDL_GameControllerClose"] = wasmExports["UB"];
    _SDL_GameControllerQuitMappings = Module["_SDL_GameControllerQuitMappings"] = wasmExports["VB"];
    _SDL_FreeVIDPIDList = Module["_SDL_FreeVIDPIDList"] = wasmExports["WB"];
    _SDL_GameControllerEventState = Module["_SDL_GameControllerEventState"] = wasmExports["XB"];
    _SDL_GameControllerHandleDelayedGuideButton = Module["_SDL_GameControllerHandleDelayedGuideButton"] = wasmExports["YB"];
    _SDL_GameControllerGetAppleSFSymbolsNameForButton = Module["_SDL_GameControllerGetAppleSFSymbolsNameForButton"] = wasmExports["ZB"];
    _SDL_GameControllerGetAppleSFSymbolsNameForAxis = Module["_SDL_GameControllerGetAppleSFSymbolsNameForAxis"] = wasmExports["_B"];
    _SDL_asprintf = Module["_SDL_asprintf"] = wasmExports["$B"];
    _SDL_strtol = Module["_SDL_strtol"] = wasmExports["aC"];
    _SDL_SetJoystickGUIDCRC = Module["_SDL_SetJoystickGUIDCRC"] = wasmExports["bC"];
    _SDL_SetJoystickGUIDVersion = Module["_SDL_SetJoystickGUIDVersion"] = wasmExports["cC"];
    _SDL_isdigit = Module["_SDL_isdigit"] = wasmExports["dC"];
    _SDL_RecordGesture = Module["_SDL_RecordGesture"] = wasmExports["eC"];
    _SDL_GestureQuit = Module["_SDL_GestureQuit"] = wasmExports["fC"];
    _SDL_SaveAllDollarTemplates = Module["_SDL_SaveAllDollarTemplates"] = wasmExports["gC"];
    _SDL_SaveDollarTemplate = Module["_SDL_SaveDollarTemplate"] = wasmExports["hC"];
    _SDL_LoadDollarTemplates = Module["_SDL_LoadDollarTemplates"] = wasmExports["iC"];
    _SDL_GestureAddTouch = Module["_SDL_GestureAddTouch"] = wasmExports["jC"];
    _SDL_GestureDelTouch = Module["_SDL_GestureDelTouch"] = wasmExports["kC"];
    _SDL_fabs = Module["_SDL_fabs"] = wasmExports["lC"];
    _SDL_sqrt = Module["_SDL_sqrt"] = wasmExports["mC"];
    _SDL_atan2 = Module["_SDL_atan2"] = wasmExports["nC"];
    _SDL_cos = Module["_SDL_cos"] = wasmExports["oC"];
    _SDL_sin = Module["_SDL_sin"] = wasmExports["pC"];
    _SDL_setenv = Module["_SDL_setenv"] = wasmExports["qC"];
    _setenv = Module["_setenv"] = wasmExports["rC"];
    _SDL_GUIDToString = Module["_SDL_GUIDToString"] = wasmExports["sC"];
    _SDL_GUIDFromString = Module["_SDL_GUIDFromString"] = wasmExports["tC"];
    _SDL_ResetHint = Module["_SDL_ResetHint"] = wasmExports["uC"];
    _SDL_ResetHints = Module["_SDL_ResetHints"] = wasmExports["vC"];
    _SDL_SetHint = Module["_SDL_SetHint"] = wasmExports["wC"];
    _SDL_JoysticksInitialized = Module["_SDL_JoysticksInitialized"] = wasmExports["xC"];
    _SDL_JoysticksQuitting = Module["_SDL_JoysticksQuitting"] = wasmExports["yC"];
    _SDL_JoysticksLocked = Module["_SDL_JoysticksLocked"] = wasmExports["zC"];
    _SDL_InitSteamVirtualGamepadInfo = Module["_SDL_InitSteamVirtualGamepadInfo"] = wasmExports["AC"];
    _SDL_QuitSteamVirtualGamepadInfo = Module["_SDL_QuitSteamVirtualGamepadInfo"] = wasmExports["CC"];
    _SDL_GetNextJoystickInstanceID = Module["_SDL_GetNextJoystickInstanceID"] = wasmExports["DC"];
    _SDL_SteamVirtualGamepadEnabled = Module["_SDL_SteamVirtualGamepadEnabled"] = wasmExports["EC"];
    _SDL_JoystickGetDeviceIndexFromInstanceID = Module["_SDL_JoystickGetDeviceIndexFromInstanceID"] = wasmExports["FC"];
    _SDL_GetSteamVirtualGamepadInfo = Module["_SDL_GetSteamVirtualGamepadInfo"] = wasmExports["GC"];
    _SDL_JoystickGetDevicePlayerIndex = Module["_SDL_JoystickGetDevicePlayerIndex"] = wasmExports["HC"];
    _SDL_PrivateJoystickBatteryLevel = Module["_SDL_PrivateJoystickBatteryLevel"] = wasmExports["JC"];
    _SDL_JoystickAttachVirtual = Module["_SDL_JoystickAttachVirtual"] = wasmExports["KC"];
    _SDL_JoystickAttachVirtualEx = Module["_SDL_JoystickAttachVirtualEx"] = wasmExports["LC"];
    _SDL_JoystickDetachVirtual = Module["_SDL_JoystickDetachVirtual"] = wasmExports["MC"];
    _SDL_JoystickIsVirtual = Module["_SDL_JoystickIsVirtual"] = wasmExports["NC"];
    _SDL_JoystickSetVirtualAxis = Module["_SDL_JoystickSetVirtualAxis"] = wasmExports["OC"];
    _SDL_JoystickSetVirtualButton = Module["_SDL_JoystickSetVirtualButton"] = wasmExports["PC"];
    _SDL_JoystickSetVirtualHat = Module["_SDL_JoystickSetVirtualHat"] = wasmExports["QC"];
    _SDL_JoystickNumAxes = Module["_SDL_JoystickNumAxes"] = wasmExports["RC"];
    _SDL_JoystickNumHats = Module["_SDL_JoystickNumHats"] = wasmExports["SC"];
    _SDL_JoystickNumBalls = Module["_SDL_JoystickNumBalls"] = wasmExports["TC"];
    _SDL_JoystickNumButtons = Module["_SDL_JoystickNumButtons"] = wasmExports["UC"];
    _SDL_JoystickGetAxisInitialState = Module["_SDL_JoystickGetAxisInitialState"] = wasmExports["VC"];
    _SDL_JoystickGetBall = Module["_SDL_JoystickGetBall"] = wasmExports["WC"];
    _SDL_JoystickInstanceID = Module["_SDL_JoystickInstanceID"] = wasmExports["XC"];
    _SDL_JoystickFromInstanceID = Module["_SDL_JoystickFromInstanceID"] = wasmExports["YC"];
    _SDL_PrivateJoystickAddTouchpad = Module["_SDL_PrivateJoystickAddTouchpad"] = wasmExports["ZC"];
    _SDL_PrivateJoystickAddSensor = Module["_SDL_PrivateJoystickAddSensor"] = wasmExports["_C"];
    _SDL_PrivateJoystickAdded = Module["_SDL_PrivateJoystickAdded"] = wasmExports["$C"];
    _SDL_PrivateJoystickForceRecentering = Module["_SDL_PrivateJoystickForceRecentering"] = wasmExports["aD"];
    _SDL_PrivateJoystickAxis = Module["_SDL_PrivateJoystickAxis"] = wasmExports["bD"];
    _SDL_PrivateJoystickButton = Module["_SDL_PrivateJoystickButton"] = wasmExports["cD"];
    _SDL_PrivateJoystickHat = Module["_SDL_PrivateJoystickHat"] = wasmExports["dD"];
    _SDL_PrivateJoystickTouchpad = Module["_SDL_PrivateJoystickTouchpad"] = wasmExports["eD"];
    _SDL_abs = Module["_SDL_abs"] = wasmExports["fD"];
    _SDL_HasWindows = Module["_SDL_HasWindows"] = wasmExports["gD"];
    _SDL_GetKeyboardFocus = Module["_SDL_GetKeyboardFocus"] = wasmExports["hD"];
    _SDL_PrivateJoystickRemoved = Module["_SDL_PrivateJoystickRemoved"] = wasmExports["iD"];
    _SDL_PrivateJoystickBall = Module["_SDL_PrivateJoystickBall"] = wasmExports["jD"];
    _SDL_UpdateSteamVirtualGamepadInfo = Module["_SDL_UpdateSteamVirtualGamepadInfo"] = wasmExports["kD"];
    _SDL_CreateJoystickName = Module["_SDL_CreateJoystickName"] = wasmExports["lD"];
    _GuessControllerName = Module["_GuessControllerName"] = wasmExports["mD"];
    _SDL_GetJoystickGameControllerTypeFromVIDPID = Module["_SDL_GetJoystickGameControllerTypeFromVIDPID"] = wasmExports["nD"];
    _SDL_tolower = Module["_SDL_tolower"] = wasmExports["oD"];
    _GuessControllerType = Module["_GuessControllerType"] = wasmExports["pD"];
    _SDL_CreateJoystickGUID = Module["_SDL_CreateJoystickGUID"] = wasmExports["qD"];
    _SDL_CreateJoystickGUIDForName = Module["_SDL_CreateJoystickGUIDForName"] = wasmExports["rD"];
    _SDL_SetJoystickGUIDVendor = Module["_SDL_SetJoystickGUIDVendor"] = wasmExports["sD"];
    _SDL_SetJoystickGUIDProduct = Module["_SDL_SetJoystickGUIDProduct"] = wasmExports["tD"];
    _SDL_IsJoystickXInput = Module["_SDL_IsJoystickXInput"] = wasmExports["uD"];
    _SDL_IsJoystickMFI = Module["_SDL_IsJoystickMFI"] = wasmExports["vD"];
    _SDL_IsJoystickXboxOne = Module["_SDL_IsJoystickXboxOne"] = wasmExports["wD"];
    _SDL_IsJoystickBluetoothXboxOne = Module["_SDL_IsJoystickBluetoothXboxOne"] = wasmExports["xD"];
    _SDL_IsJoystickPS4 = Module["_SDL_IsJoystickPS4"] = wasmExports["yD"];
    _SDL_IsJoystickPS5 = Module["_SDL_IsJoystickPS5"] = wasmExports["zD"];
    _SDL_IsJoystickNintendoSwitchPro = Module["_SDL_IsJoystickNintendoSwitchPro"] = wasmExports["AD"];
    _SDL_IsJoystickNintendoSwitchProInputOnly = Module["_SDL_IsJoystickNintendoSwitchProInputOnly"] = wasmExports["BD"];
    _SDL_IsJoystickNintendoSwitchJoyCon = Module["_SDL_IsJoystickNintendoSwitchJoyCon"] = wasmExports["CD"];
    _SDL_IsJoystickNintendoSwitchJoyConLeft = Module["_SDL_IsJoystickNintendoSwitchJoyConLeft"] = wasmExports["DD"];
    _SDL_IsJoystickNintendoSwitchJoyConRight = Module["_SDL_IsJoystickNintendoSwitchJoyConRight"] = wasmExports["ED"];
    _SDL_IsJoystickNintendoSwitchJoyConGrip = Module["_SDL_IsJoystickNintendoSwitchJoyConGrip"] = wasmExports["FD"];
    _SDL_IsJoystickSteamDeck = Module["_SDL_IsJoystickSteamDeck"] = wasmExports["GD"];
    _SDL_ShouldIgnoreJoystick = Module["_SDL_ShouldIgnoreJoystick"] = wasmExports["HD"];
    _SDL_JoystickGetDeviceVendor = Module["_SDL_JoystickGetDeviceVendor"] = wasmExports["ID"];
    _SDL_JoystickGetDeviceProduct = Module["_SDL_JoystickGetDeviceProduct"] = wasmExports["JD"];
    _SDL_JoystickGetDeviceProductVersion = Module["_SDL_JoystickGetDeviceProductVersion"] = wasmExports["KD"];
    _SDL_JoystickGetDeviceType = Module["_SDL_JoystickGetDeviceType"] = wasmExports["LD"];
    _SDL_JoystickGetType = Module["_SDL_JoystickGetType"] = wasmExports["MD"];
    _SDL_JoystickCurrentPowerLevel = Module["_SDL_JoystickCurrentPowerLevel"] = wasmExports["ND"];
    _SDL_PrivateJoystickSensor = Module["_SDL_PrivateJoystickSensor"] = wasmExports["OD"];
    _SDL_LoadVIDPIDListFromHints = Module["_SDL_LoadVIDPIDListFromHints"] = wasmExports["PD"];
    _SDL_LoadFile = Module["_SDL_LoadFile"] = wasmExports["QD"];
    _SDL_UCS4ToUTF8 = Module["_SDL_UCS4ToUTF8"] = wasmExports["RD"];
    _SDL_KeyboardInit = Module["_SDL_KeyboardInit"] = wasmExports["SD"];
    _SDL_SetKeymap = Module["_SDL_SetKeymap"] = wasmExports["TD"];
    _SDL_ResetKeyboard = Module["_SDL_ResetKeyboard"] = wasmExports["UD"];
    _SDL_SendKeyboardKey = Module["_SDL_SendKeyboardKey"] = wasmExports["VD"];
    _SDL_GetDefaultKeymap = Module["_SDL_GetDefaultKeymap"] = wasmExports["WD"];
    _SDL_SetScancodeName = Module["_SDL_SetScancodeName"] = wasmExports["XD"];
    _SDL_SetKeyboardFocus = Module["_SDL_SetKeyboardFocus"] = wasmExports["YD"];
    _SDL_CaptureMouse = Module["_SDL_CaptureMouse"] = wasmExports["ZD"];
    _SDL_UpdateMouseCapture = Module["_SDL_UpdateMouseCapture"] = wasmExports["_D"];
    _SDL_SendWindowEvent = Module["_SDL_SendWindowEvent"] = wasmExports["$D"];
    _SDL_SendKeyboardUnicodeKey = Module["_SDL_SendKeyboardUnicodeKey"] = wasmExports["aE"];
    _SDL_SendVirtualKeyboardKey = Module["_SDL_SendVirtualKeyboardKey"] = wasmExports["bE"];
    _SDL_SendKeyboardKeyAndKeycode = Module["_SDL_SendKeyboardKeyAndKeycode"] = wasmExports["cE"];
    _SDL_SendKeyboardKeyAutoRelease = Module["_SDL_SendKeyboardKeyAutoRelease"] = wasmExports["dE"];
    _SDL_HardwareKeyboardKeyPressed = Module["_SDL_HardwareKeyboardKeyPressed"] = wasmExports["eE"];
    _SDL_SendKeyboardText = Module["_SDL_SendKeyboardText"] = wasmExports["fE"];
    _SDL_utf8strlcpy = Module["_SDL_utf8strlcpy"] = wasmExports["gE"];
    _SDL_SendEditingText = Module["_SDL_SendEditingText"] = wasmExports["hE"];
    _SDL_KeyboardQuit = Module["_SDL_KeyboardQuit"] = wasmExports["iE"];
    _SDL_GetKeyboardState = Module["_SDL_GetKeyboardState"] = wasmExports["jE"];
    _SDL_GetModState = Module["_SDL_GetModState"] = wasmExports["kE"];
    _SDL_SetModState = Module["_SDL_SetModState"] = wasmExports["lE"];
    _SDL_ToggleModState = Module["_SDL_ToggleModState"] = wasmExports["mE"];
    _SDL_GetKeyFromScancode = Module["_SDL_GetKeyFromScancode"] = wasmExports["nE"];
    _SDL_GetDefaultKeyFromScancode = Module["_SDL_GetDefaultKeyFromScancode"] = wasmExports["oE"];
    _SDL_GetScancodeFromKey = Module["_SDL_GetScancodeFromKey"] = wasmExports["pE"];
    _SDL_GetScancodeName = Module["_SDL_GetScancodeName"] = wasmExports["qE"];
    _SDL_GetScancodeFromName = Module["_SDL_GetScancodeFromName"] = wasmExports["rE"];
    _SDL_GetKeyName = Module["_SDL_GetKeyName"] = wasmExports["sE"];
    _SDL_GetKeyFromName = Module["_SDL_GetKeyFromName"] = wasmExports["tE"];
    _SDL_ListAdd = Module["_SDL_ListAdd"] = wasmExports["uE"];
    _SDL_ListPop = Module["_SDL_ListPop"] = wasmExports["vE"];
    _SDL_ListRemove = Module["_SDL_ListRemove"] = wasmExports["wE"];
    _SDL_ListClear = Module["_SDL_ListClear"] = wasmExports["xE"];
    _SDL_LogResetPriorities = Module["_SDL_LogResetPriorities"] = wasmExports["yE"];
    _SDL_LogSetAllPriority = Module["_SDL_LogSetAllPriority"] = wasmExports["zE"];
    _SDL_LogSetPriority = Module["_SDL_LogSetPriority"] = wasmExports["AE"];
    _SDL_LogVerbose = Module["_SDL_LogVerbose"] = wasmExports["BE"];
    _SDL_LogInfo = Module["_SDL_LogInfo"] = wasmExports["CE"];
    _SDL_LogWarn = Module["_SDL_LogWarn"] = wasmExports["DE"];
    _SDL_LogError = Module["_SDL_LogError"] = wasmExports["EE"];
    _SDL_LogMessage = Module["_SDL_LogMessage"] = wasmExports["FE"];
    _SDL_LogGetOutputFunction = Module["_SDL_LogGetOutputFunction"] = wasmExports["GE"];
    _SDL_LogSetOutputFunction = Module["_SDL_LogSetOutputFunction"] = wasmExports["HE"];
    _SDL_GetOriginalMemoryFunctions = Module["_SDL_GetOriginalMemoryFunctions"] = wasmExports["IE"];
    _SDL_GetMemoryFunctions = Module["_SDL_GetMemoryFunctions"] = wasmExports["JE"];
    _SDL_SetMemoryFunctions = Module["_SDL_SetMemoryFunctions"] = wasmExports["KE"];
    _SDL_GetNumAllocations = Module["_SDL_GetNumAllocations"] = wasmExports["LE"];
    _SDL_MousePreInit = Module["_SDL_MousePreInit"] = wasmExports["ME"];
    _SDL_GetMouse = Module["_SDL_GetMouse"] = wasmExports["NE"];
    _SDL_atof = Module["_SDL_atof"] = wasmExports["OE"];
    _SDL_AddTouch = Module["_SDL_AddTouch"] = wasmExports["PE"];
    _SDL_MousePostInit = Module["_SDL_MousePostInit"] = wasmExports["QE"];
    _SDL_CreateColorCursor = Module["_SDL_CreateColorCursor"] = wasmExports["RE"];
    _SDL_SetDefaultCursor = Module["_SDL_SetDefaultCursor"] = wasmExports["SE"];
    _SDL_FreeSurface = Module["_SDL_FreeSurface"] = wasmExports["TE"];
    _SDL_ConvertSurfaceFormat = Module["_SDL_ConvertSurfaceFormat"] = wasmExports["UE"];
    _SDL_SetCursor = Module["_SDL_SetCursor"] = wasmExports["VE"];
    _SDL_GetMouseFocus = Module["_SDL_GetMouseFocus"] = wasmExports["WE"];
    _SDL_SetMouseFocus = Module["_SDL_SetMouseFocus"] = wasmExports["XE"];
    _SDL_SendMouseMotion = Module["_SDL_SendMouseMotion"] = wasmExports["YE"];
    _SDL_SendTouchMotion = Module["_SDL_SendTouchMotion"] = wasmExports["ZE"];
    _SDL_floor = Module["_SDL_floor"] = wasmExports["_E"];
    _SDL_sqrtf = Module["_SDL_sqrtf"] = wasmExports["$E"];
    _SDL_GetWindowMouseRect = Module["_SDL_GetWindowMouseRect"] = wasmExports["aF"];
    _SDL_IntersectRect = Module["_SDL_IntersectRect"] = wasmExports["bF"];
    _SDL_SetMouseSystemScale = Module["_SDL_SetMouseSystemScale"] = wasmExports["cF"];
    _SDL_SendMouseButtonClicks = Module["_SDL_SendMouseButtonClicks"] = wasmExports["dF"];
    _SDL_SendTouch = Module["_SDL_SendTouch"] = wasmExports["eF"];
    _SDL_SendMouseButton = Module["_SDL_SendMouseButton"] = wasmExports["fF"];
    _SDL_SendMouseWheel = Module["_SDL_SendMouseWheel"] = wasmExports["gF"];
    _SDL_MouseQuit = Module["_SDL_MouseQuit"] = wasmExports["hF"];
    _SDL_FreeCursor = Module["_SDL_FreeCursor"] = wasmExports["iF"];
    _SDL_GetMessageBoxCount = Module["_SDL_GetMessageBoxCount"] = wasmExports["jF"];
    _SDL_UpdateWindowGrab = Module["_SDL_UpdateWindowGrab"] = wasmExports["kF"];
    _SDL_GetMouseState = Module["_SDL_GetMouseState"] = wasmExports["lF"];
    _SDL_GetRelativeMouseState = Module["_SDL_GetRelativeMouseState"] = wasmExports["mF"];
    _SDL_GetGlobalMouseState = Module["_SDL_GetGlobalMouseState"] = wasmExports["nF"];
    _SDL_PerformWarpMouseInWindow = Module["_SDL_PerformWarpMouseInWindow"] = wasmExports["oF"];
    _SDL_WarpMouseInWindow = Module["_SDL_WarpMouseInWindow"] = wasmExports["pF"];
    _SDL_WarpMouseGlobal = Module["_SDL_WarpMouseGlobal"] = wasmExports["qF"];
    _SDL_CreateCursor = Module["_SDL_CreateCursor"] = wasmExports["rF"];
    _SDL_CreateSystemCursor = Module["_SDL_CreateSystemCursor"] = wasmExports["sF"];
    _SDL_GetCursor = Module["_SDL_GetCursor"] = wasmExports["tF"];
    _SDL_GetDefaultCursor = Module["_SDL_GetDefaultCursor"] = wasmExports["uF"];
    _SDL_GetPixelFormatName = Module["_SDL_GetPixelFormatName"] = wasmExports["vF"];
    _SDL_PixelFormatEnumToMasks = Module["_SDL_PixelFormatEnumToMasks"] = wasmExports["wF"];
    _SDL_MasksToPixelFormatEnum = Module["_SDL_MasksToPixelFormatEnum"] = wasmExports["xF"];
    _SDL_AllocFormat = Module["_SDL_AllocFormat"] = wasmExports["yF"];
    _SDL_InitFormat = Module["_SDL_InitFormat"] = wasmExports["zF"];
    _SDL_FreeFormat = Module["_SDL_FreeFormat"] = wasmExports["AF"];
    _SDL_FreePalette = Module["_SDL_FreePalette"] = wasmExports["BF"];
    _SDL_AllocPalette = Module["_SDL_AllocPalette"] = wasmExports["CF"];
    _SDL_SetPixelFormatPalette = Module["_SDL_SetPixelFormatPalette"] = wasmExports["DF"];
    _SDL_DitherColors = Module["_SDL_DitherColors"] = wasmExports["EF"];
    _SDL_FindColor = Module["_SDL_FindColor"] = wasmExports["FF"];
    _SDL_DetectPalette = Module["_SDL_DetectPalette"] = wasmExports["GF"];
    _SDL_MapRGB = Module["_SDL_MapRGB"] = wasmExports["HF"];
    _SDL_MapRGBA = Module["_SDL_MapRGBA"] = wasmExports["IF"];
    _SDL_GetRGB = Module["_SDL_GetRGB"] = wasmExports["JF"];
    _SDL_GetRGBA = Module["_SDL_GetRGBA"] = wasmExports["LF"];
    _SDL_AllocBlitMap = Module["_SDL_AllocBlitMap"] = wasmExports["MF"];
    _SDL_InvalidateAllBlitMap = Module["_SDL_InvalidateAllBlitMap"] = wasmExports["NF"];
    _SDL_InvalidateMap = Module["_SDL_InvalidateMap"] = wasmExports["OF"];
    _SDL_MapSurface = Module["_SDL_MapSurface"] = wasmExports["PF"];
    _SDL_sscanf = Module["_SDL_sscanf"] = wasmExports["QF"];
    _SDL_FreeBlitMap = Module["_SDL_FreeBlitMap"] = wasmExports["RF"];
    _SDL_CalculateGammaRamp = Module["_SDL_CalculateGammaRamp"] = wasmExports["SF"];
    _SDL_pow = Module["_SDL_pow"] = wasmExports["TF"];
    _SDL_qsort = Module["_SDL_qsort"] = wasmExports["UF"];
    _SDL_bsearch = Module["_SDL_bsearch"] = wasmExports["VF"];
    _SDL_SendQuit = Module["_SDL_SendQuit"] = wasmExports["WF"];
    _SDL_GetSpanEnclosingRect = Module["_SDL_GetSpanEnclosingRect"] = wasmExports["XF"];
    _SDL_HasIntersection = Module["_SDL_HasIntersection"] = wasmExports["YF"];
    _SDL_UnionRect = Module["_SDL_UnionRect"] = wasmExports["ZF"];
    _SDL_EnclosePoints = Module["_SDL_EnclosePoints"] = wasmExports["_F"];
    _SDL_IntersectRectAndLine = Module["_SDL_IntersectRectAndLine"] = wasmExports["$F"];
    _SDL_HasIntersectionF = Module["_SDL_HasIntersectionF"] = wasmExports["aG"];
    _SDL_IntersectFRect = Module["_SDL_IntersectFRect"] = wasmExports["bG"];
    _SDL_UnionFRect = Module["_SDL_UnionFRect"] = wasmExports["cG"];
    _SDL_EncloseFPoints = Module["_SDL_EncloseFPoints"] = wasmExports["dG"];
    _SDL_IntersectFRectAndLine = Module["_SDL_IntersectFRectAndLine"] = wasmExports["eG"];
    _SDL_RenderFlush = Module["_SDL_RenderFlush"] = wasmExports["fG"];
    _SDL_AllocateRenderVertices = Module["_SDL_AllocateRenderVertices"] = wasmExports["gG"];
    _SDL_GetNumRenderDrivers = Module["_SDL_GetNumRenderDrivers"] = wasmExports["hG"];
    _SDL_GetRenderDriverInfo = Module["_SDL_GetRenderDriverInfo"] = wasmExports["iG"];
    _SDL_CreateWindowAndRenderer = Module["_SDL_CreateWindowAndRenderer"] = wasmExports["jG"];
    _SDL_HasWindowSurface = Module["_SDL_HasWindowSurface"] = wasmExports["kG"];
    _SDL_GetWindowData = Module["_SDL_GetWindowData"] = wasmExports["lG"];
    _SDL_GetWindowDisplayIndex = Module["_SDL_GetWindowDisplayIndex"] = wasmExports["oG"];
    _SDL_GetDesktopDisplayMode = Module["_SDL_GetDesktopDisplayMode"] = wasmExports["pG"];
    _SDL_SetWindowData = Module["_SDL_SetWindowData"] = wasmExports["qG"];
    _SDL_RenderSetViewport = Module["_SDL_RenderSetViewport"] = wasmExports["rG"];
    _SDL_GetRenderer = Module["_SDL_GetRenderer"] = wasmExports["sG"];
    _SDL_GetRendererOutputSize = Module["_SDL_GetRendererOutputSize"] = wasmExports["tG"];
    _SDL_GetWindowFromID = Module["_SDL_GetWindowFromID"] = wasmExports["uG"];
    _SDL_GetRenderTarget = Module["_SDL_GetRenderTarget"] = wasmExports["vG"];
    _SDL_SetRenderTarget = Module["_SDL_SetRenderTarget"] = wasmExports["wG"];
    _SDL_truncf = Module["_SDL_truncf"] = wasmExports["xG"];
    _SDL_CreateSoftwareRenderer = Module["_SDL_CreateSoftwareRenderer"] = wasmExports["yG"];
    _SW_CreateRendererForSurface = Module["_SW_CreateRendererForSurface"] = wasmExports["zG"];
    _SDL_RenderGetWindow = Module["_SDL_RenderGetWindow"] = wasmExports["AG"];
    _SDL_GetRendererInfo = Module["_SDL_GetRendererInfo"] = wasmExports["BG"];
    _SDL_QueryTexture = Module["_SDL_QueryTexture"] = wasmExports["CG"];
    _SDL_CreateTexture = Module["_SDL_CreateTexture"] = wasmExports["DG"];
    _SDL_SW_CreateYUVTexture = Module["_SDL_SW_CreateYUVTexture"] = wasmExports["EG"];
    _SDL_SW_DestroyYUVTexture = Module["_SDL_SW_DestroyYUVTexture"] = wasmExports["FG"];
    _SDL_HasColorKey = Module["_SDL_HasColorKey"] = wasmExports["GG"];
    _SDL_UpdateTexture = Module["_SDL_UpdateTexture"] = wasmExports["HG"];
    _SDL_ConvertSurface = Module["_SDL_ConvertSurface"] = wasmExports["IG"];
    _SDL_GetSurfaceColorMod = Module["_SDL_GetSurfaceColorMod"] = wasmExports["JG"];
    _SDL_SetTextureColorMod = Module["_SDL_SetTextureColorMod"] = wasmExports["KG"];
    _SDL_GetSurfaceAlphaMod = Module["_SDL_GetSurfaceAlphaMod"] = wasmExports["LG"];
    _SDL_SetTextureAlphaMod = Module["_SDL_SetTextureAlphaMod"] = wasmExports["MG"];
    _SDL_GetSurfaceBlendMode = Module["_SDL_GetSurfaceBlendMode"] = wasmExports["NG"];
    _SDL_SetTextureBlendMode = Module["_SDL_SetTextureBlendMode"] = wasmExports["OG"];
    _SDL_SW_UpdateYUVTexture = Module["_SDL_SW_UpdateYUVTexture"] = wasmExports["PG"];
    _SDL_LockTexture = Module["_SDL_LockTexture"] = wasmExports["QG"];
    _SDL_SW_CopyYUVToRGB = Module["_SDL_SW_CopyYUVToRGB"] = wasmExports["RG"];
    _SDL_UnlockTexture = Module["_SDL_UnlockTexture"] = wasmExports["SG"];
    _SDL_GetTextureColorMod = Module["_SDL_GetTextureColorMod"] = wasmExports["TG"];
    _SDL_GetTextureAlphaMod = Module["_SDL_GetTextureAlphaMod"] = wasmExports["UG"];
    _SDL_GetTextureBlendMode = Module["_SDL_GetTextureBlendMode"] = wasmExports["VG"];
    _SDL_SetTextureScaleMode = Module["_SDL_SetTextureScaleMode"] = wasmExports["WG"];
    _SDL_GetTextureScaleMode = Module["_SDL_GetTextureScaleMode"] = wasmExports["XG"];
    _SDL_SetTextureUserData = Module["_SDL_SetTextureUserData"] = wasmExports["YG"];
    _SDL_GetTextureUserData = Module["_SDL_GetTextureUserData"] = wasmExports["ZG"];
    _SDL_ConvertPixels = Module["_SDL_ConvertPixels"] = wasmExports["_G"];
    _SDL_UpdateYUVTexture = Module["_SDL_UpdateYUVTexture"] = wasmExports["$G"];
    _SDL_SW_UpdateYUVTexturePlanar = Module["_SDL_SW_UpdateYUVTexturePlanar"] = wasmExports["aH"];
    _SDL_UpdateNVTexture = Module["_SDL_UpdateNVTexture"] = wasmExports["bH"];
    _SDL_SW_UpdateNVTexturePlanar = Module["_SDL_SW_UpdateNVTexturePlanar"] = wasmExports["cH"];
    _SDL_SW_LockYUVTexture = Module["_SDL_SW_LockYUVTexture"] = wasmExports["dH"];
    _SDL_LockTextureToSurface = Module["_SDL_LockTextureToSurface"] = wasmExports["eH"];
    _SDL_CreateRGBSurfaceWithFormatFrom = Module["_SDL_CreateRGBSurfaceWithFormatFrom"] = wasmExports["fH"];
    _SDL_RenderTargetSupported = Module["_SDL_RenderTargetSupported"] = wasmExports["gH"];
    _SDL_RenderSetLogicalSize = Module["_SDL_RenderSetLogicalSize"] = wasmExports["hH"];
    _SDL_RenderSetScale = Module["_SDL_RenderSetScale"] = wasmExports["iH"];
    _SDL_RenderGetLogicalSize = Module["_SDL_RenderGetLogicalSize"] = wasmExports["jH"];
    _SDL_RenderSetIntegerScale = Module["_SDL_RenderSetIntegerScale"] = wasmExports["kH"];
    _SDL_RenderGetIntegerScale = Module["_SDL_RenderGetIntegerScale"] = wasmExports["lH"];
    _SDL_RenderGetViewport = Module["_SDL_RenderGetViewport"] = wasmExports["mH"];
    _SDL_RenderSetClipRect = Module["_SDL_RenderSetClipRect"] = wasmExports["nH"];
    _SDL_RenderGetClipRect = Module["_SDL_RenderGetClipRect"] = wasmExports["oH"];
    _SDL_RenderIsClipEnabled = Module["_SDL_RenderIsClipEnabled"] = wasmExports["pH"];
    _SDL_RenderGetScale = Module["_SDL_RenderGetScale"] = wasmExports["qH"];
    _SDL_RenderWindowToLogical = Module["_SDL_RenderWindowToLogical"] = wasmExports["rH"];
    _SDL_RenderLogicalToWindow = Module["_SDL_RenderLogicalToWindow"] = wasmExports["sH"];
    _SDL_SetRenderDrawColor = Module["_SDL_SetRenderDrawColor"] = wasmExports["tH"];
    _SDL_GetRenderDrawColor = Module["_SDL_GetRenderDrawColor"] = wasmExports["uH"];
    _SDL_SetRenderDrawBlendMode = Module["_SDL_SetRenderDrawBlendMode"] = wasmExports["vH"];
    _SDL_GetRenderDrawBlendMode = Module["_SDL_GetRenderDrawBlendMode"] = wasmExports["wH"];
    _SDL_RenderDrawPoint = Module["_SDL_RenderDrawPoint"] = wasmExports["xH"];
    _SDL_RenderDrawPointsF = Module["_SDL_RenderDrawPointsF"] = wasmExports["yH"];
    _SDL_RenderDrawPointF = Module["_SDL_RenderDrawPointF"] = wasmExports["zH"];
    _SDL_RenderDrawPoints = Module["_SDL_RenderDrawPoints"] = wasmExports["AH"];
    _SDL_RenderDrawLine = Module["_SDL_RenderDrawLine"] = wasmExports["BH"];
    _SDL_RenderDrawLinesF = Module["_SDL_RenderDrawLinesF"] = wasmExports["CH"];
    _SDL_RenderDrawLineF = Module["_SDL_RenderDrawLineF"] = wasmExports["DH"];
    _SDL_RenderDrawLines = Module["_SDL_RenderDrawLines"] = wasmExports["EH"];
    _SDL_roundf = Module["_SDL_roundf"] = wasmExports["FH"];
    _SDL_RenderDrawRect = Module["_SDL_RenderDrawRect"] = wasmExports["GH"];
    _SDL_RenderDrawRectF = Module["_SDL_RenderDrawRectF"] = wasmExports["HH"];
    _SDL_RenderDrawRects = Module["_SDL_RenderDrawRects"] = wasmExports["IH"];
    _SDL_RenderDrawRectsF = Module["_SDL_RenderDrawRectsF"] = wasmExports["JH"];
    _SDL_RenderFillRect = Module["_SDL_RenderFillRect"] = wasmExports["KH"];
    _SDL_RenderFillRectsF = Module["_SDL_RenderFillRectsF"] = wasmExports["LH"];
    _SDL_RenderFillRectF = Module["_SDL_RenderFillRectF"] = wasmExports["MH"];
    _SDL_RenderFillRects = Module["_SDL_RenderFillRects"] = wasmExports["NH"];
    _SDL_RenderCopyF = Module["_SDL_RenderCopyF"] = wasmExports["OH"];
    _SDL_RenderCopyEx = Module["_SDL_RenderCopyEx"] = wasmExports["PH"];
    _SDL_RenderCopyExF = Module["_SDL_RenderCopyExF"] = wasmExports["QH"];
    _SDL_sinf = Module["_SDL_sinf"] = wasmExports["RH"];
    _SDL_cosf = Module["_SDL_cosf"] = wasmExports["SH"];
    _SDL_RenderGeometry = Module["_SDL_RenderGeometry"] = wasmExports["TH"];
    _SDL_RenderGeometryRaw = Module["_SDL_RenderGeometryRaw"] = wasmExports["UH"];
    _SDL_RenderReadPixels = Module["_SDL_RenderReadPixels"] = wasmExports["VH"];
    _SDL_GetWindowPixelFormat = Module["_SDL_GetWindowPixelFormat"] = wasmExports["WH"];
    _SDL_DestroyRendererWithoutFreeing = Module["_SDL_DestroyRendererWithoutFreeing"] = wasmExports["XH"];
    _SDL_GL_BindTexture = Module["_SDL_GL_BindTexture"] = wasmExports["YH"];
    _SDL_GL_UnbindTexture = Module["_SDL_GL_UnbindTexture"] = wasmExports["ZH"];
    _SDL_RenderGetMetalLayer = Module["_SDL_RenderGetMetalLayer"] = wasmExports["_H"];
    _SDL_RenderGetMetalCommandEncoder = Module["_SDL_RenderGetMetalCommandEncoder"] = wasmExports["$H"];
    _SDL_ComposeCustomBlendMode = Module["_SDL_ComposeCustomBlendMode"] = wasmExports["aI"];
    _SDL_GetBlendModeSrcColorFactor = Module["_SDL_GetBlendModeSrcColorFactor"] = wasmExports["bI"];
    _SDL_GetBlendModeDstColorFactor = Module["_SDL_GetBlendModeDstColorFactor"] = wasmExports["cI"];
    _SDL_GetBlendModeColorOperation = Module["_SDL_GetBlendModeColorOperation"] = wasmExports["dI"];
    _SDL_GetBlendModeSrcAlphaFactor = Module["_SDL_GetBlendModeSrcAlphaFactor"] = wasmExports["eI"];
    _SDL_GetBlendModeDstAlphaFactor = Module["_SDL_GetBlendModeDstAlphaFactor"] = wasmExports["fI"];
    _SDL_GetBlendModeAlphaOperation = Module["_SDL_GetBlendModeAlphaOperation"] = wasmExports["gI"];
    _SDL_RenderSetVSync = Module["_SDL_RenderSetVSync"] = wasmExports["hI"];
    _SDL_GL_GetAttribute = Module["_SDL_GL_GetAttribute"] = wasmExports["iI"];
    _SDL_GL_SetAttribute = Module["_SDL_GL_SetAttribute"] = wasmExports["jI"];
    _SDL_RecreateWindow = Module["_SDL_RecreateWindow"] = wasmExports["kI"];
    _SDL_GL_CreateContext = Module["_SDL_GL_CreateContext"] = wasmExports["lI"];
    _SDL_GL_MakeCurrent = Module["_SDL_GL_MakeCurrent"] = wasmExports["mI"];
    _SDL_GL_DeleteContext = Module["_SDL_GL_DeleteContext"] = wasmExports["nI"];
    _SDL_GL_GetProcAddress = Module["_SDL_GL_GetProcAddress"] = wasmExports["oI"];
    _GLES2_GetTexCoordPrecisionEnumFromHint = Module["_GLES2_GetTexCoordPrecisionEnumFromHint"] = wasmExports["pI"];
    _SDL_GL_SetSwapInterval = Module["_SDL_GL_SetSwapInterval"] = wasmExports["qI"];
    _SDL_GL_GetSwapInterval = Module["_SDL_GL_GetSwapInterval"] = wasmExports["rI"];
    _SDL_GL_ExtensionSupported = Module["_SDL_GL_ExtensionSupported"] = wasmExports["sI"];
    _SDL_GL_GetDrawableSize = Module["_SDL_GL_GetDrawableSize"] = wasmExports["tI"];
    _SDL_GL_GetCurrentContext = Module["_SDL_GL_GetCurrentContext"] = wasmExports["uI"];
    _SDL_atan2f = Module["_SDL_atan2f"] = wasmExports["vI"];
    _SDL_GL_SwapWindowWithResult = Module["_SDL_GL_SwapWindowWithResult"] = wasmExports["wI"];
    _GLES2_GetShader = Module["_GLES2_GetShader"] = wasmExports["xI"];
    _GLES2_GetShaderPrologue = Module["_GLES2_GetShaderPrologue"] = wasmExports["yI"];
    _GLES2_GetShaderInclude = Module["_GLES2_GetShaderInclude"] = wasmExports["zI"];
    _SDL_GetYUVConversionModeForResolution = Module["_SDL_GetYUVConversionModeForResolution"] = wasmExports["AI"];
    _SDL_DestroyWindowSurface = Module["_SDL_DestroyWindowSurface"] = wasmExports["BI"];
    _SDL_GetWindowSizeInPixels = Module["_SDL_GetWindowSizeInPixels"] = wasmExports["CI"];
    _SDL_SetSurfaceColorMod = Module["_SDL_SetSurfaceColorMod"] = wasmExports["DI"];
    _SDL_SetSurfaceAlphaMod = Module["_SDL_SetSurfaceAlphaMod"] = wasmExports["EI"];
    _SDL_SetSurfaceBlendMode = Module["_SDL_SetSurfaceBlendMode"] = wasmExports["FI"];
    _SDL_SetSurfaceRLE = Module["_SDL_SetSurfaceRLE"] = wasmExports["GI"];
    _trianglepoint_2_fixedpoint = Module["_trianglepoint_2_fixedpoint"] = wasmExports["HI"];
    _SDL_GetWindowSurface = Module["_SDL_GetWindowSurface"] = wasmExports["II"];
    _SDL_SetClipRect = Module["_SDL_SetClipRect"] = wasmExports["JI"];
    _SDL_UpperBlit = Module["_SDL_UpperBlit"] = wasmExports["KI"];
    _SDL_CreateRGBSurfaceWithFormat = Module["_SDL_CreateRGBSurfaceWithFormat"] = wasmExports["LI"];
    _SDL_PrivateUpperBlitScaled = Module["_SDL_PrivateUpperBlitScaled"] = wasmExports["MI"];
    _SDL_CreateRGBSurfaceFrom = Module["_SDL_CreateRGBSurfaceFrom"] = wasmExports["NI"];
    _SDLgfx_rotozoomSurfaceSizeTrig = Module["_SDLgfx_rotozoomSurfaceSizeTrig"] = wasmExports["OI"];
    _SDLgfx_rotateSurface = Module["_SDLgfx_rotateSurface"] = wasmExports["PI"];
    _SDL_SW_BlitTriangle = Module["_SDL_SW_BlitTriangle"] = wasmExports["QI"];
    _SDL_SW_FillTriangle = Module["_SDL_SW_FillTriangle"] = wasmExports["RI"];
    _SDL_UpdateWindowSurface = Module["_SDL_UpdateWindowSurface"] = wasmExports["SI"];
    _SDL_GetColorKey = Module["_SDL_GetColorKey"] = wasmExports["TI"];
    _SDL_SetColorKey = Module["_SDL_SetColorKey"] = wasmExports["UI"];
    _SDL_RWFromFP = Module["_SDL_RWFromFP"] = wasmExports["VI"];
    _SDL_AllocRW = Module["_SDL_AllocRW"] = wasmExports["WI"];
    _fseeko = Module["_fseeko"] = wasmExports["XI"];
    _ftello = Module["_ftello"] = wasmExports["YI"];
    _ferror = Module["_ferror"] = wasmExports["ZI"];
    _SDL_RWFromMem = Module["_SDL_RWFromMem"] = wasmExports["_I"];
    _SDL_RWFromConstMem = Module["_SDL_RWFromConstMem"] = wasmExports["$I"];
    _SDL_FreeRW = Module["_SDL_FreeRW"] = wasmExports["aJ"];
    _SDL_LoadFile_RW = Module["_SDL_LoadFile_RW"] = wasmExports["bJ"];
    _SDL_RWseek = Module["_SDL_RWseek"] = wasmExports["cJ"];
    _SDL_RWtell = Module["_SDL_RWtell"] = wasmExports["dJ"];
    _SDL_ReadU8 = Module["_SDL_ReadU8"] = wasmExports["eJ"];
    _SDL_ReadLE16 = Module["_SDL_ReadLE16"] = wasmExports["fJ"];
    _SDL_ReadBE16 = Module["_SDL_ReadBE16"] = wasmExports["gJ"];
    _SDL_ReadLE32 = Module["_SDL_ReadLE32"] = wasmExports["hJ"];
    _SDL_ReadBE32 = Module["_SDL_ReadBE32"] = wasmExports["iJ"];
    _SDL_ReadLE64 = Module["_SDL_ReadLE64"] = wasmExports["jJ"];
    _SDL_ReadBE64 = Module["_SDL_ReadBE64"] = wasmExports["kJ"];
    _SDL_WriteU8 = Module["_SDL_WriteU8"] = wasmExports["lJ"];
    _SDL_WriteLE16 = Module["_SDL_WriteLE16"] = wasmExports["mJ"];
    _SDL_WriteBE16 = Module["_SDL_WriteBE16"] = wasmExports["nJ"];
    _SDL_WriteLE32 = Module["_SDL_WriteLE32"] = wasmExports["oJ"];
    _SDL_WriteBE32 = Module["_SDL_WriteBE32"] = wasmExports["pJ"];
    _SDL_WriteLE64 = Module["_SDL_WriteLE64"] = wasmExports["qJ"];
    _SDL_WriteBE64 = Module["_SDL_WriteBE64"] = wasmExports["rJ"];
    _SDL_LockSensors = Module["_SDL_LockSensors"] = wasmExports["sJ"];
    _SDL_UnlockSensors = Module["_SDL_UnlockSensors"] = wasmExports["tJ"];
    _SDL_GetNextSensorInstanceID = Module["_SDL_GetNextSensorInstanceID"] = wasmExports["uJ"];
    _SDL_SensorGetDeviceName = Module["_SDL_SensorGetDeviceName"] = wasmExports["vJ"];
    _SDL_SensorGetDeviceType = Module["_SDL_SensorGetDeviceType"] = wasmExports["wJ"];
    _SDL_SensorGetDeviceNonPortableType = Module["_SDL_SensorGetDeviceNonPortableType"] = wasmExports["xJ"];
    _SDL_SensorGetDeviceInstanceID = Module["_SDL_SensorGetDeviceInstanceID"] = wasmExports["yJ"];
    _SDL_SensorOpen = Module["_SDL_SensorOpen"] = wasmExports["zJ"];
    _SDL_SensorFromInstanceID = Module["_SDL_SensorFromInstanceID"] = wasmExports["AJ"];
    _SDL_SensorGetName = Module["_SDL_SensorGetName"] = wasmExports["BJ"];
    _SDL_SensorGetType = Module["_SDL_SensorGetType"] = wasmExports["CJ"];
    _SDL_SensorGetNonPortableType = Module["_SDL_SensorGetNonPortableType"] = wasmExports["DJ"];
    _SDL_SensorGetInstanceID = Module["_SDL_SensorGetInstanceID"] = wasmExports["EJ"];
    _SDL_SensorGetData = Module["_SDL_SensorGetData"] = wasmExports["FJ"];
    _SDL_SensorGetDataWithTimestamp = Module["_SDL_SensorGetDataWithTimestamp"] = wasmExports["GJ"];
    _SDL_SensorClose = Module["_SDL_SensorClose"] = wasmExports["HJ"];
    _SDL_PrivateSensorUpdate = Module["_SDL_PrivateSensorUpdate"] = wasmExports["IJ"];
    _SDL_AtomicTryLock = Module["_SDL_AtomicTryLock"] = wasmExports["JJ"];
    _SDL_atan = Module["_SDL_atan"] = wasmExports["KJ"];
    _SDL_atanf = Module["_SDL_atanf"] = wasmExports["LJ"];
    _atanf = Module["_atanf"] = wasmExports["MJ"];
    _atan2f = Module["_atan2f"] = wasmExports["NJ"];
    _SDL_acos = Module["_SDL_acos"] = wasmExports["OJ"];
    _SDL_acosf = Module["_SDL_acosf"] = wasmExports["PJ"];
    _acosf = Module["_acosf"] = wasmExports["QJ"];
    _SDL_asin = Module["_SDL_asin"] = wasmExports["RJ"];
    _SDL_asinf = Module["_SDL_asinf"] = wasmExports["SJ"];
    _asinf = Module["_asinf"] = wasmExports["TJ"];
    _SDL_ceilf = Module["_SDL_ceilf"] = wasmExports["UJ"];
    _SDL_copysign = Module["_SDL_copysign"] = wasmExports["VJ"];
    _SDL_copysignf = Module["_SDL_copysignf"] = wasmExports["WJ"];
    _cosf = Module["_cosf"] = wasmExports["XJ"];
    _SDL_exp = Module["_SDL_exp"] = wasmExports["YJ"];
    _SDL_expf = Module["_SDL_expf"] = wasmExports["ZJ"];
    _expf = Module["_expf"] = wasmExports["_J"];
    _SDL_fabsf = Module["_SDL_fabsf"] = wasmExports["$J"];
    _SDL_floorf = Module["_SDL_floorf"] = wasmExports["aK"];
    _SDL_trunc = Module["_SDL_trunc"] = wasmExports["bK"];
    _SDL_fmod = Module["_SDL_fmod"] = wasmExports["cK"];
    _SDL_fmodf = Module["_SDL_fmodf"] = wasmExports["dK"];
    _fmodf = Module["_fmodf"] = wasmExports["eK"];
    _SDL_log = Module["_SDL_log"] = wasmExports["fK"];
    _SDL_logf = Module["_SDL_logf"] = wasmExports["gK"];
    _logf = Module["_logf"] = wasmExports["hK"];
    _SDL_log10 = Module["_SDL_log10"] = wasmExports["iK"];
    _SDL_log10f = Module["_SDL_log10f"] = wasmExports["jK"];
    _log10f = Module["_log10f"] = wasmExports["kK"];
    _SDL_powf = Module["_SDL_powf"] = wasmExports["lK"];
    _powf = Module["_powf"] = wasmExports["mK"];
    _SDL_round = Module["_SDL_round"] = wasmExports["nK"];
    _roundf = Module["_roundf"] = wasmExports["oK"];
    _SDL_lround = Module["_SDL_lround"] = wasmExports["pK"];
    _lround = Module["_lround"] = wasmExports["qK"];
    _SDL_lroundf = Module["_SDL_lroundf"] = wasmExports["rK"];
    _lroundf = Module["_lroundf"] = wasmExports["sK"];
    _SDL_scalbn = Module["_SDL_scalbn"] = wasmExports["tK"];
    _scalbn = Module["_scalbn"] = wasmExports["uK"];
    _SDL_scalbnf = Module["_SDL_scalbnf"] = wasmExports["vK"];
    _scalbnf = Module["_scalbnf"] = wasmExports["wK"];
    _sinf = Module["_sinf"] = wasmExports["xK"];
    _SDL_tan = Module["_SDL_tan"] = wasmExports["yK"];
    _SDL_tanf = Module["_SDL_tanf"] = wasmExports["zK"];
    _tanf = Module["_tanf"] = wasmExports["AK"];
    _SDL_isalpha = Module["_SDL_isalpha"] = wasmExports["BK"];
    _SDL_isalnum = Module["_SDL_isalnum"] = wasmExports["CK"];
    _isalnum = Module["_isalnum"] = wasmExports["DK"];
    _SDL_isxdigit = Module["_SDL_isxdigit"] = wasmExports["EK"];
    _SDL_ispunct = Module["_SDL_ispunct"] = wasmExports["FK"];
    _ispunct = Module["_ispunct"] = wasmExports["GK"];
    _SDL_isspace = Module["_SDL_isspace"] = wasmExports["HK"];
    _SDL_isupper = Module["_SDL_isupper"] = wasmExports["IK"];
    _SDL_islower = Module["_SDL_islower"] = wasmExports["JK"];
    _SDL_isprint = Module["_SDL_isprint"] = wasmExports["KK"];
    _SDL_isgraph = Module["_SDL_isgraph"] = wasmExports["LK"];
    _SDL_iscntrl = Module["_SDL_iscntrl"] = wasmExports["MK"];
    _iscntrl = Module["_iscntrl"] = wasmExports["NK"];
    _SDL_toupper = Module["_SDL_toupper"] = wasmExports["OK"];
    _tolower = Module["_tolower"] = wasmExports["PK"];
    _SDL_isblank = Module["_SDL_isblank"] = wasmExports["QK"];
    _isblank = Module["_isblank"] = wasmExports["RK"];
    _SDL_strtoul = Module["_SDL_strtoul"] = wasmExports["SK"];
    _SDL_strtoull = Module["_SDL_strtoull"] = wasmExports["TK"];
    _SDL_SoftStretch = Module["_SDL_SoftStretch"] = wasmExports["UK"];
    _SDL_SoftStretchLinear = Module["_SDL_SoftStretchLinear"] = wasmExports["VK"];
    _SDL_wcslen = Module["_SDL_wcslen"] = wasmExports["WK"];
    _wcslen = Module["_wcslen"] = wasmExports["XK"];
    _SDL_wcslcpy = Module["_SDL_wcslcpy"] = wasmExports["YK"];
    _SDL_wcslcat = Module["_SDL_wcslcat"] = wasmExports["ZK"];
    _SDL_wcsdup = Module["_SDL_wcsdup"] = wasmExports["_K"];
    _SDL_wcsstr = Module["_SDL_wcsstr"] = wasmExports["$K"];
    _wcsstr = Module["_wcsstr"] = wasmExports["aL"];
    _SDL_wcscmp = Module["_SDL_wcscmp"] = wasmExports["bL"];
    _wcscmp = Module["_wcscmp"] = wasmExports["cL"];
    _SDL_wcsncmp = Module["_SDL_wcsncmp"] = wasmExports["dL"];
    _wcsncmp = Module["_wcsncmp"] = wasmExports["eL"];
    _SDL_wcscasecmp = Module["_SDL_wcscasecmp"] = wasmExports["fL"];
    _wcscasecmp = Module["_wcscasecmp"] = wasmExports["gL"];
    _SDL_wcsncasecmp = Module["_SDL_wcsncasecmp"] = wasmExports["hL"];
    _wcsncasecmp = Module["_wcsncasecmp"] = wasmExports["iL"];
    _strlcpy = Module["_strlcpy"] = wasmExports["jL"];
    _SDL_utf8strlen = Module["_SDL_utf8strlen"] = wasmExports["kL"];
    _SDL_utf8strnlen = Module["_SDL_utf8strnlen"] = wasmExports["lL"];
    _strlcat = Module["_strlcat"] = wasmExports["mL"];
    _SDL_strrev = Module["_SDL_strrev"] = wasmExports["nL"];
    _SDL_strupr = Module["_SDL_strupr"] = wasmExports["oL"];
    _SDL_strlwr = Module["_SDL_strlwr"] = wasmExports["pL"];
    _SDL_strrchr = Module["_SDL_strrchr"] = wasmExports["qL"];
    _SDL_strcasestr = Module["_SDL_strcasestr"] = wasmExports["rL"];
    _SDL_itoa = Module["_SDL_itoa"] = wasmExports["sL"];
    _SDL_ltoa = Module["_SDL_ltoa"] = wasmExports["tL"];
    _SDL_uitoa = Module["_SDL_uitoa"] = wasmExports["uL"];
    _SDL_ultoa = Module["_SDL_ultoa"] = wasmExports["vL"];
    _SDL_lltoa = Module["_SDL_lltoa"] = wasmExports["wL"];
    _SDL_ulltoa = Module["_SDL_ulltoa"] = wasmExports["xL"];
    _atoi = Module["_atoi"] = wasmExports["yL"];
    _atof = Module["_atof"] = wasmExports["zL"];
    _strtol = Module["_strtol"] = wasmExports["AL"];
    _strtoul = Module["_strtoul"] = wasmExports["BL"];
    _SDL_strtoll = Module["_SDL_strtoll"] = wasmExports["CL"];
    _strtoll = Module["_strtoll"] = wasmExports["DL"];
    _strtoull = Module["_strtoull"] = wasmExports["EL"];
    _SDL_strtod = Module["_SDL_strtod"] = wasmExports["FL"];
    _strtod = Module["_strtod"] = wasmExports["GL"];
    _SDL_strncmp = Module["_SDL_strncmp"] = wasmExports["HL"];
    _vsscanf = Module["_vsscanf"] = wasmExports["IL"];
    _SDL_vsscanf = Module["_SDL_vsscanf"] = wasmExports["JL"];
    _SDL_vasprintf = Module["_SDL_vasprintf"] = wasmExports["KL"];
    _SDL_SetSurfacePalette = Module["_SDL_SetSurfacePalette"] = wasmExports["LL"];
    _SDL_HasSurfaceRLE = Module["_SDL_HasSurfaceRLE"] = wasmExports["ML"];
    _SDL_GetClipRect = Module["_SDL_GetClipRect"] = wasmExports["NL"];
    _SDL_LowerBlit = Module["_SDL_LowerBlit"] = wasmExports["OL"];
    _SDL_UpperBlitScaled = Module["_SDL_UpperBlitScaled"] = wasmExports["PL"];
    _SDL_PrivateLowerBlitScaled = Module["_SDL_PrivateLowerBlitScaled"] = wasmExports["QL"];
    _SDL_LowerBlitScaled = Module["_SDL_LowerBlitScaled"] = wasmExports["RL"];
    _SDL_DuplicateSurface = Module["_SDL_DuplicateSurface"] = wasmExports["SL"];
    _SDL_ConvertPixels_YUV_to_YUV = Module["_SDL_ConvertPixels_YUV_to_YUV"] = wasmExports["TL"];
    _SDL_ConvertPixels_YUV_to_RGB = Module["_SDL_ConvertPixels_YUV_to_RGB"] = wasmExports["UL"];
    _SDL_ConvertPixels_RGB_to_YUV = Module["_SDL_ConvertPixels_RGB_to_YUV"] = wasmExports["VL"];
    _SDL_PremultiplyAlpha = Module["_SDL_PremultiplyAlpha"] = wasmExports["WL"];
    _SDL_LoadObject = Module["_SDL_LoadObject"] = wasmExports["XL"];
    _SDL_LoadFunction = Module["_SDL_LoadFunction"] = wasmExports["YL"];
    _SDL_UnloadObject = Module["_SDL_UnloadObject"] = wasmExports["ZL"];
    _SDL_TryLockMutex = Module["_SDL_TryLockMutex"] = wasmExports["_L"];
    _SDL_SemTryWait = Module["_SDL_SemTryWait"] = wasmExports["$L"];
    _SDL_SemWaitTimeout = Module["_SDL_SemWaitTimeout"] = wasmExports["aM"];
    _SDL_SemValue = Module["_SDL_SemValue"] = wasmExports["bM"];
    _SDL_SYS_CreateThread = Module["_SDL_SYS_CreateThread"] = wasmExports["cM"];
    _SDL_SYS_SetupThread = Module["_SDL_SYS_SetupThread"] = wasmExports["dM"];
    _SDL_SYS_SetThreadPriority = Module["_SDL_SYS_SetThreadPriority"] = wasmExports["eM"];
    _SDL_SYS_WaitThread = Module["_SDL_SYS_WaitThread"] = wasmExports["fM"];
    _SDL_SYS_DetachThread = Module["_SDL_SYS_DetachThread"] = wasmExports["gM"];
    _gettimeofday = Module["_gettimeofday"] = wasmExports["hM"];
    _SDL_GetPerformanceCounter = Module["_SDL_GetPerformanceCounter"] = wasmExports["iM"];
    _SDL_GetPerformanceFrequency = Module["_SDL_GetPerformanceFrequency"] = wasmExports["jM"];
    _nanosleep = Module["_nanosleep"] = wasmExports["kM"];
    _SDL_SYS_InitTLSData = Module["_SDL_SYS_InitTLSData"] = wasmExports["lM"];
    _SDL_SYS_GetTLSData = Module["_SDL_SYS_GetTLSData"] = wasmExports["mM"];
    _SDL_SYS_SetTLSData = Module["_SDL_SYS_SetTLSData"] = wasmExports["nM"];
    _SDL_SYS_QuitTLSData = Module["_SDL_SYS_QuitTLSData"] = wasmExports["oM"];
    _SDL_Generic_InitTLSData = Module["_SDL_Generic_InitTLSData"] = wasmExports["pM"];
    _SDL_Generic_GetTLSData = Module["_SDL_Generic_GetTLSData"] = wasmExports["qM"];
    _SDL_Generic_SetTLSData = Module["_SDL_Generic_SetTLSData"] = wasmExports["rM"];
    _SDL_Generic_QuitTLSData = Module["_SDL_Generic_QuitTLSData"] = wasmExports["sM"];
    _SDL_TLSCreate = Module["_SDL_TLSCreate"] = wasmExports["tM"];
    _SDL_TLSGet = Module["_SDL_TLSGet"] = wasmExports["uM"];
    _SDL_TLSSet = Module["_SDL_TLSSet"] = wasmExports["vM"];
    _SDL_TLSCleanup = Module["_SDL_TLSCleanup"] = wasmExports["wM"];
    _SDL_RunThread = Module["_SDL_RunThread"] = wasmExports["xM"];
    _SDL_CreateThreadWithStackSize = Module["_SDL_CreateThreadWithStackSize"] = wasmExports["yM"];
    _SDL_CreateThread = Module["_SDL_CreateThread"] = wasmExports["zM"];
    _SDL_GetThreadID = Module["_SDL_GetThreadID"] = wasmExports["AM"];
    _SDL_GetThreadName = Module["_SDL_GetThreadName"] = wasmExports["BM"];
    _SDL_DetachThread = Module["_SDL_DetachThread"] = wasmExports["CM"];
    _SDL_AddTimer = Module["_SDL_AddTimer"] = wasmExports["DM"];
    _SDL_RemoveTimer = Module["_SDL_RemoveTimer"] = wasmExports["EM"];
    _SDL_TouchInit = Module["_SDL_TouchInit"] = wasmExports["FM"];
    _SDL_GetNumTouchDevices = Module["_SDL_GetNumTouchDevices"] = wasmExports["GM"];
    _SDL_GetTouchDevice = Module["_SDL_GetTouchDevice"] = wasmExports["HM"];
    _SDL_GetTouchName = Module["_SDL_GetTouchName"] = wasmExports["IM"];
    _SDL_GetTouch = Module["_SDL_GetTouch"] = wasmExports["JM"];
    _SDL_GetTouchDeviceType = Module["_SDL_GetTouchDeviceType"] = wasmExports["KM"];
    _SDL_GetNumTouchFingers = Module["_SDL_GetNumTouchFingers"] = wasmExports["LM"];
    _SDL_GetTouchFinger = Module["_SDL_GetTouchFinger"] = wasmExports["MM"];
    _SDL_GetWindowID = Module["_SDL_GetWindowID"] = wasmExports["NM"];
    _SDL_DelTouch = Module["_SDL_DelTouch"] = wasmExports["OM"];
    _SDL_TouchQuit = Module["_SDL_TouchQuit"] = wasmExports["PM"];
    _SDL_GetNumVideoDrivers = Module["_SDL_GetNumVideoDrivers"] = wasmExports["QM"];
    _SDL_GetVideoDriver = Module["_SDL_GetVideoDriver"] = wasmExports["RM"];
    _dlopen = Module["_dlopen"] = wasmExports["SM"];
    _dlerror = Module["_dlerror"] = wasmExports["TM"];
    _dlsym = Module["_dlsym"] = wasmExports["UM"];
    _dlclose = Module["_dlclose"] = wasmExports["VM"];
    _eglGetProcAddress = Module["_eglGetProcAddress"] = wasmExports["WM"];
    _SDL_AddBasicVideoDisplay = Module["_SDL_AddBasicVideoDisplay"] = wasmExports["XM"];
    _SDL_AddDisplayMode = Module["_SDL_AddDisplayMode"] = wasmExports["YM"];
    _SDL_GetCSSCursorName = Module["_SDL_GetCSSCursorName"] = wasmExports["ZM"];
    _SDL_GL_LoadLibrary = Module["_SDL_GL_LoadLibrary"] = wasmExports["_M"];
    _emscripten_compute_dom_pk_code = Module["_emscripten_compute_dom_pk_code"] = wasmExports["$M"];
    _SDL_GetDisplayForWindow = Module["_SDL_GetDisplayForWindow"] = wasmExports["aN"];
    _SDL_StartTextInput = Module["_SDL_StartTextInput"] = wasmExports["bN"];
    _SDL_ResetDisplayModes = Module["_SDL_ResetDisplayModes"] = wasmExports["cN"];
    _SDL_GL_ResetAttributes = Module["_SDL_GL_ResetAttributes"] = wasmExports["dN"];
    _SDL_DisableScreenSaver = Module["_SDL_DisableScreenSaver"] = wasmExports["eN"];
    _SDL_GetCurrentVideoDriver = Module["_SDL_GetCurrentVideoDriver"] = wasmExports["fN"];
    _SDL_OnVideoThread = Module["_SDL_OnVideoThread"] = wasmExports["gN"];
    _SDL_AddVideoDisplay = Module["_SDL_AddVideoDisplay"] = wasmExports["hN"];
    _SDL_GetIndexOfDisplay = Module["_SDL_GetIndexOfDisplay"] = wasmExports["iN"];
    _SDL_DelVideoDisplay = Module["_SDL_DelVideoDisplay"] = wasmExports["jN"];
    _SDL_GetNumVideoDisplays = Module["_SDL_GetNumVideoDisplays"] = wasmExports["kN"];
    _SDL_GetDisplayDriverData = Module["_SDL_GetDisplayDriverData"] = wasmExports["lN"];
    _SDL_IsVideoContextExternal = Module["_SDL_IsVideoContextExternal"] = wasmExports["mN"];
    _SDL_GetDisplayName = Module["_SDL_GetDisplayName"] = wasmExports["nN"];
    _SDL_GetDisplayBounds = Module["_SDL_GetDisplayBounds"] = wasmExports["oN"];
    _SDL_GetDisplayUsableBounds = Module["_SDL_GetDisplayUsableBounds"] = wasmExports["pN"];
    _SDL_GetDisplayDPI = Module["_SDL_GetDisplayDPI"] = wasmExports["qN"];
    _SDL_GetDisplayOrientation = Module["_SDL_GetDisplayOrientation"] = wasmExports["rN"];
    _bsearch = Module["_bsearch"] = wasmExports["sN"];
    _SDL_SetCurrentDisplayMode = Module["_SDL_SetCurrentDisplayMode"] = wasmExports["tN"];
    _SDL_SetDesktopDisplayMode = Module["_SDL_SetDesktopDisplayMode"] = wasmExports["uN"];
    _SDL_GetNumDisplayModes = Module["_SDL_GetNumDisplayModes"] = wasmExports["vN"];
    _SDL_GetDisplayMode = Module["_SDL_GetDisplayMode"] = wasmExports["wN"];
    _SDL_GetCurrentDisplayMode = Module["_SDL_GetCurrentDisplayMode"] = wasmExports["xN"];
    _SDL_GetClosestDisplayMode = Module["_SDL_GetClosestDisplayMode"] = wasmExports["yN"];
    _SDL_GetDisplay = Module["_SDL_GetDisplay"] = wasmExports["zN"];
    _SDL_GetPointDisplayIndex = Module["_SDL_GetPointDisplayIndex"] = wasmExports["AN"];
    _SDL_GetRectDisplayIndex = Module["_SDL_GetRectDisplayIndex"] = wasmExports["BN"];
    _SDL_SetWindowDisplayMode = Module["_SDL_SetWindowDisplayMode"] = wasmExports["CN"];
    _SDL_GetWindowDisplayMode = Module["_SDL_GetWindowDisplayMode"] = wasmExports["DN"];
    _SDL_GetWindowICCProfile = Module["_SDL_GetWindowICCProfile"] = wasmExports["EN"];
    _SDL_Vulkan_LoadLibrary = Module["_SDL_Vulkan_LoadLibrary"] = wasmExports["FN"];
    _SDL_HideWindow = Module["_SDL_HideWindow"] = wasmExports["GN"];
    _SDL_SetWindowTitle = Module["_SDL_SetWindowTitle"] = wasmExports["HN"];
    _SDL_SetWindowFullscreen = Module["_SDL_SetWindowFullscreen"] = wasmExports["IN"];
    _SDL_SetWindowGrab = Module["_SDL_SetWindowGrab"] = wasmExports["JN"];
    _SDL_ShowWindow = Module["_SDL_ShowWindow"] = wasmExports["KN"];
    _SDL_OnWindowResized = Module["_SDL_OnWindowResized"] = wasmExports["LN"];
    _SDL_CreateWindowFrom = Module["_SDL_CreateWindowFrom"] = wasmExports["MN"];
    _SDL_GL_UnloadLibrary = Module["_SDL_GL_UnloadLibrary"] = wasmExports["NN"];
    _SDL_Vulkan_UnloadLibrary = Module["_SDL_Vulkan_UnloadLibrary"] = wasmExports["ON"];
    _SDL_GetWindowTitle = Module["_SDL_GetWindowTitle"] = wasmExports["PN"];
    _SDL_SetWindowIcon = Module["_SDL_SetWindowIcon"] = wasmExports["QN"];
    _SDL_SetWindowPosition = Module["_SDL_SetWindowPosition"] = wasmExports["RN"];
    _SDL_GetWindowPosition = Module["_SDL_GetWindowPosition"] = wasmExports["SN"];
    _SDL_SetWindowBordered = Module["_SDL_SetWindowBordered"] = wasmExports["TN"];
    _SDL_SetWindowResizable = Module["_SDL_SetWindowResizable"] = wasmExports["UN"];
    _SDL_SetWindowAlwaysOnTop = Module["_SDL_SetWindowAlwaysOnTop"] = wasmExports["VN"];
    _SDL_SetWindowSize = Module["_SDL_SetWindowSize"] = wasmExports["WN"];
    _SDL_GetWindowBordersSize = Module["_SDL_GetWindowBordersSize"] = wasmExports["XN"];
    _SDL_GetWindowMinimumSize = Module["_SDL_GetWindowMinimumSize"] = wasmExports["YN"];
    _SDL_SetWindowMaximumSize = Module["_SDL_SetWindowMaximumSize"] = wasmExports["ZN"];
    _SDL_GetWindowMaximumSize = Module["_SDL_GetWindowMaximumSize"] = wasmExports["_N"];
    _SDL_RaiseWindow = Module["_SDL_RaiseWindow"] = wasmExports["$N"];
    _SDL_MaximizeWindow = Module["_SDL_MaximizeWindow"] = wasmExports["aO"];
    _SDL_UpdateWindowSurfaceRects = Module["_SDL_UpdateWindowSurfaceRects"] = wasmExports["bO"];
    _SDL_SetWindowBrightness = Module["_SDL_SetWindowBrightness"] = wasmExports["cO"];
    _SDL_SetWindowGammaRamp = Module["_SDL_SetWindowGammaRamp"] = wasmExports["dO"];
    _SDL_GetWindowGammaRamp = Module["_SDL_GetWindowGammaRamp"] = wasmExports["eO"];
    _SDL_GetWindowBrightness = Module["_SDL_GetWindowBrightness"] = wasmExports["fO"];
    _SDL_SetWindowOpacity = Module["_SDL_SetWindowOpacity"] = wasmExports["gO"];
    _SDL_GetWindowOpacity = Module["_SDL_GetWindowOpacity"] = wasmExports["hO"];
    _SDL_SetWindowModalFor = Module["_SDL_SetWindowModalFor"] = wasmExports["iO"];
    _SDL_SetWindowInputFocus = Module["_SDL_SetWindowInputFocus"] = wasmExports["jO"];
    _SDL_GetWindowGrab = Module["_SDL_GetWindowGrab"] = wasmExports["kO"];
    _SDL_GetWindowKeyboardGrab = Module["_SDL_GetWindowKeyboardGrab"] = wasmExports["lO"];
    _SDL_GetWindowMouseGrab = Module["_SDL_GetWindowMouseGrab"] = wasmExports["mO"];
    _SDL_GetGrabbedWindow = Module["_SDL_GetGrabbedWindow"] = wasmExports["nO"];
    _SDL_SetWindowMouseRect = Module["_SDL_SetWindowMouseRect"] = wasmExports["oO"];
    _SDL_FlashWindow = Module["_SDL_FlashWindow"] = wasmExports["pO"];
    _SDL_OnWindowShown = Module["_SDL_OnWindowShown"] = wasmExports["qO"];
    _SDL_OnWindowRestored = Module["_SDL_OnWindowRestored"] = wasmExports["rO"];
    _SDL_OnWindowHidden = Module["_SDL_OnWindowHidden"] = wasmExports["sO"];
    _SDL_OnWindowMoved = Module["_SDL_OnWindowMoved"] = wasmExports["tO"];
    _SDL_OnWindowLiveResizeUpdate = Module["_SDL_OnWindowLiveResizeUpdate"] = wasmExports["uO"];
    _SDL_OnWindowMinimized = Module["_SDL_OnWindowMinimized"] = wasmExports["vO"];
    _SDL_OnWindowEnter = Module["_SDL_OnWindowEnter"] = wasmExports["wO"];
    _SDL_OnWindowLeave = Module["_SDL_OnWindowLeave"] = wasmExports["xO"];
    _SDL_OnWindowFocusGained = Module["_SDL_OnWindowFocusGained"] = wasmExports["yO"];
    _SDL_OnWindowFocusLost = Module["_SDL_OnWindowFocusLost"] = wasmExports["zO"];
    _SDL_IsScreenSaverEnabled = Module["_SDL_IsScreenSaverEnabled"] = wasmExports["AO"];
    _SDL_EnableScreenSaver = Module["_SDL_EnableScreenSaver"] = wasmExports["BO"];
    _SDL_GL_DeduceMaxSupportedESProfile = Module["_SDL_GL_DeduceMaxSupportedESProfile"] = wasmExports["CO"];
    _SDL_GL_GetCurrentWindow = Module["_SDL_GL_GetCurrentWindow"] = wasmExports["DO"];
    _SDL_GL_SwapWindow = Module["_SDL_GL_SwapWindow"] = wasmExports["EO"];
    _SDL_GetWindowWMInfo = Module["_SDL_GetWindowWMInfo"] = wasmExports["FO"];
    _SDL_ClearComposition = Module["_SDL_ClearComposition"] = wasmExports["GO"];
    _SDL_IsTextInputShown = Module["_SDL_IsTextInputShown"] = wasmExports["HO"];
    _SDL_IsTextInputActive = Module["_SDL_IsTextInputActive"] = wasmExports["IO"];
    _SDL_StopTextInput = Module["_SDL_StopTextInput"] = wasmExports["JO"];
    _SDL_SetTextInputRect = Module["_SDL_SetTextInputRect"] = wasmExports["KO"];
    _SDL_HasScreenKeyboardSupport = Module["_SDL_HasScreenKeyboardSupport"] = wasmExports["LO"];
    _SDL_IsScreenKeyboardShown = Module["_SDL_IsScreenKeyboardShown"] = wasmExports["MO"];
    _SDL_ShouldAllowTopmost = Module["_SDL_ShouldAllowTopmost"] = wasmExports["NO"];
    _SDL_SetWindowHitTest = Module["_SDL_SetWindowHitTest"] = wasmExports["OO"];
    _SDL_ComputeDiagonalDPI = Module["_SDL_ComputeDiagonalDPI"] = wasmExports["PO"];
    _SDL_OnApplicationWillTerminate = Module["_SDL_OnApplicationWillTerminate"] = wasmExports["QO"];
    _SDL_OnApplicationDidReceiveMemoryWarning = Module["_SDL_OnApplicationDidReceiveMemoryWarning"] = wasmExports["RO"];
    _SDL_OnApplicationWillResignActive = Module["_SDL_OnApplicationWillResignActive"] = wasmExports["SO"];
    _SDL_OnApplicationDidEnterBackground = Module["_SDL_OnApplicationDidEnterBackground"] = wasmExports["TO"];
    _SDL_OnApplicationWillEnterForeground = Module["_SDL_OnApplicationWillEnterForeground"] = wasmExports["UO"];
    _SDL_OnApplicationDidBecomeActive = Module["_SDL_OnApplicationDidBecomeActive"] = wasmExports["VO"];
    _SDL_Vulkan_GetVkGetInstanceProcAddr = Module["_SDL_Vulkan_GetVkGetInstanceProcAddr"] = wasmExports["WO"];
    _SDL_Vulkan_GetInstanceExtensions = Module["_SDL_Vulkan_GetInstanceExtensions"] = wasmExports["XO"];
    _SDL_Vulkan_CreateSurface = Module["_SDL_Vulkan_CreateSurface"] = wasmExports["YO"];
    _SDL_Vulkan_GetDrawableSize = Module["_SDL_Vulkan_GetDrawableSize"] = wasmExports["ZO"];
    _SDL_Metal_CreateView = Module["_SDL_Metal_CreateView"] = wasmExports["_O"];
    _SDL_Metal_DestroyView = Module["_SDL_Metal_DestroyView"] = wasmExports["$O"];
    _SDL_Metal_GetLayer = Module["_SDL_Metal_GetLayer"] = wasmExports["aP"];
    _SDL_Metal_GetDrawableSize = Module["_SDL_Metal_GetDrawableSize"] = wasmExports["bP"];
    _SDL_SetYUVConversionMode = Module["_SDL_SetYUVConversionMode"] = wasmExports["cP"];
    _SDL_GetYUVConversionMode = Module["_SDL_GetYUVConversionMode"] = wasmExports["dP"];
    _SDL_CalculateYUVSize = Module["_SDL_CalculateYUVSize"] = wasmExports["eP"];
    _yuv420_rgba_std = Module["_yuv420_rgba_std"] = wasmExports["fP"];
    _yuv420_rgb24_std = Module["_yuv420_rgb24_std"] = wasmExports["gP"];
    _yuv420_abgr_std = Module["_yuv420_abgr_std"] = wasmExports["hP"];
    _yuv422_rgba_std = Module["_yuv422_rgba_std"] = wasmExports["iP"];
    _yuv422_rgb24_std = Module["_yuv422_rgb24_std"] = wasmExports["jP"];
    _yuv422_abgr_std = Module["_yuv422_abgr_std"] = wasmExports["kP"];
    _yuvnv12_rgba_std = Module["_yuvnv12_rgba_std"] = wasmExports["lP"];
    _yuvnv12_rgb24_std = Module["_yuvnv12_rgb24_std"] = wasmExports["mP"];
    _yuvnv12_abgr_std = Module["_yuvnv12_abgr_std"] = wasmExports["nP"];
    _yuv420_rgb565_std = Module["_yuv420_rgb565_std"] = wasmExports["oP"];
    _yuv422_rgb565_std = Module["_yuv422_rgb565_std"] = wasmExports["pP"];
    _yuvnv12_rgb565_std = Module["_yuvnv12_rgb565_std"] = wasmExports["qP"];
    _yuvnv12_bgra_std = Module["_yuvnv12_bgra_std"] = wasmExports["rP"];
    _yuvnv12_argb_std = Module["_yuvnv12_argb_std"] = wasmExports["sP"];
    _yuv422_bgra_std = Module["_yuv422_bgra_std"] = wasmExports["tP"];
    _yuv422_argb_std = Module["_yuv422_argb_std"] = wasmExports["uP"];
    _yuv420_bgra_std = Module["_yuv420_bgra_std"] = wasmExports["vP"];
    _yuv420_argb_std = Module["_yuv420_argb_std"] = wasmExports["wP"];
    _SDL_SW_QueryYUVTexturePixels = Module["_SDL_SW_QueryYUVTexturePixels"] = wasmExports["xP"];
    _SDL_SW_UnlockYUVTexture = Module["_SDL_SW_UnlockYUVTexture"] = wasmExports["yP"];
    _rgb24_yuv420_std = Module["_rgb24_yuv420_std"] = wasmExports["zP"];
    _emscripten_GetProcAddress = Module["_emscripten_GetProcAddress"] = wasmExports["AP"];
    _emscripten_webgl_get_proc_address = Module["_emscripten_webgl_get_proc_address"] = wasmExports["BP"];
    _emscripten_webgl1_get_proc_address = Module["_emscripten_webgl1_get_proc_address"] = wasmExports["CP"];
    __webgl1_match_ext_proc_address_without_suffix = Module["__webgl1_match_ext_proc_address_without_suffix"] = wasmExports["DP"];
    _glfwGetProcAddress = Module["_glfwGetProcAddress"] = wasmExports["EP"];
    _emscripten_webgl_init_context_attributes = Module["_emscripten_webgl_init_context_attributes"] = wasmExports["FP"];
    _emscripten_is_main_runtime_thread = Module["_emscripten_is_main_runtime_thread"] = wasmExports["GP"];
    _emscripten_dom_pk_code_to_string = Module["_emscripten_dom_pk_code_to_string"] = wasmExports["HP"];
    _emscripten_builtin_memcpy = Module["_emscripten_builtin_memcpy"] = wasmExports["IP"];
    ___memset = Module["___memset"] = wasmExports["JP"];
    _emscripten_builtin_memset = Module["_emscripten_builtin_memset"] = wasmExports["KP"];
    _memset = Module["_memset"] = wasmExports["LP"];
    _sqrt = Module["_sqrt"] = wasmExports["MP"];
    _fabs = Module["_fabs"] = wasmExports["NP"];
    _waitid = Module["_waitid"] = wasmExports["OP"];
    _times = Module["_times"] = wasmExports["PP"];
    _getdate = Module["_getdate"] = wasmExports["QP"];
    _stime = Module["_stime"] = wasmExports["RP"];
    _clock_getcpuclockid = Module["_clock_getcpuclockid"] = wasmExports["SP"];
    _getpwnam = Module["_getpwnam"] = wasmExports["TP"];
    ____errno_location = Module["____errno_location"] = wasmExports["UP"];
    _getpwnam_r = Module["_getpwnam_r"] = wasmExports["VP"];
    _getpwuid_r = Module["_getpwuid_r"] = wasmExports["WP"];
    _setpwent = Module["_setpwent"] = wasmExports["XP"];
    _endpwent = Module["_endpwent"] = wasmExports["YP"];
    _getpwent = Module["_getpwent"] = wasmExports["ZP"];
    _getgrnam = Module["_getgrnam"] = wasmExports["_P"];
    _getgrgid = Module["_getgrgid"] = wasmExports["$P"];
    _getgrnam_r = Module["_getgrnam_r"] = wasmExports["aQ"];
    _getgrgid_r = Module["_getgrgid_r"] = wasmExports["bQ"];
    _getgrent = Module["_getgrent"] = wasmExports["cQ"];
    _endgrent = Module["_endgrent"] = wasmExports["dQ"];
    _setgrent = Module["_setgrent"] = wasmExports["eQ"];
    _flock = Module["_flock"] = wasmExports["fQ"];
    _chroot = Module["_chroot"] = wasmExports["gQ"];
    _execve = Module["_execve"] = wasmExports["hQ"];
    _vfork = Module["_vfork"] = wasmExports["iQ"];
    _posix_spawn = Module["_posix_spawn"] = wasmExports["jQ"];
    _popen = Module["_popen"] = wasmExports["kQ"];
    _pclose = Module["_pclose"] = wasmExports["lQ"];
    _setgroups = Module["_setgroups"] = wasmExports["mQ"];
    _sigaltstack = Module["_sigaltstack"] = wasmExports["nQ"];
    ___dlsym = Module["___dlsym"] = wasmExports["oQ"];
    ___dl_seterr = Module["___dl_seterr"] = wasmExports["pQ"];
    _getloadavg = Module["_getloadavg"] = wasmExports["qQ"];
    ___syscall_uname = Module["___syscall_uname"] = wasmExports["rQ"];
    ___syscall_setpgid = Module["___syscall_setpgid"] = wasmExports["sQ"];
    ___syscall_sync = Module["___syscall_sync"] = wasmExports["tQ"];
    ___syscall_getsid = Module["___syscall_getsid"] = wasmExports["uQ"];
    ___syscall_getpgid = Module["___syscall_getpgid"] = wasmExports["vQ"];
    ___syscall_getpid = Module["___syscall_getpid"] = wasmExports["wQ"];
    ___syscall_getppid = Module["___syscall_getppid"] = wasmExports["xQ"];
    ___syscall_linkat = Module["___syscall_linkat"] = wasmExports["yQ"];
    ___syscall_getgroups32 = Module["___syscall_getgroups32"] = wasmExports["zQ"];
    ___syscall_setsid = Module["___syscall_setsid"] = wasmExports["AQ"];
    ___syscall_umask = Module["___syscall_umask"] = wasmExports["BQ"];
    ___syscall_getrusage = Module["___syscall_getrusage"] = wasmExports["CQ"];
    ___syscall_getpriority = Module["___syscall_getpriority"] = wasmExports["DQ"];
    ___syscall_setpriority = Module["___syscall_setpriority"] = wasmExports["EQ"];
    ___syscall_setdomainname = Module["___syscall_setdomainname"] = wasmExports["FQ"];
    ___syscall_getuid32 = Module["___syscall_getuid32"] = wasmExports["GQ"];
    ___syscall_getgid32 = Module["___syscall_getgid32"] = wasmExports["HQ"];
    ___syscall_geteuid32 = Module["___syscall_geteuid32"] = wasmExports["IQ"];
    ___syscall_getegid32 = Module["___syscall_getegid32"] = wasmExports["JQ"];
    ___syscall_getresuid32 = Module["___syscall_getresuid32"] = wasmExports["KQ"];
    ___syscall_getresgid32 = Module["___syscall_getresgid32"] = wasmExports["LQ"];
    ___syscall_pause = Module["___syscall_pause"] = wasmExports["MQ"];
    ___syscall_madvise = Module["___syscall_madvise"] = wasmExports["NQ"];
    ___syscall_mlock = Module["___syscall_mlock"] = wasmExports["OQ"];
    ___syscall_munlock = Module["___syscall_munlock"] = wasmExports["PQ"];
    ___syscall_mprotect = Module["___syscall_mprotect"] = wasmExports["QQ"];
    ___syscall_mremap = Module["___syscall_mremap"] = wasmExports["RQ"];
    ___syscall_mlockall = Module["___syscall_mlockall"] = wasmExports["SQ"];
    ___syscall_munlockall = Module["___syscall_munlockall"] = wasmExports["TQ"];
    ___syscall_prlimit64 = Module["___syscall_prlimit64"] = wasmExports["UQ"];
    ___syscall_setsockopt = Module["___syscall_setsockopt"] = wasmExports["VQ"];
    ___syscall_acct = Module["___syscall_acct"] = wasmExports["WQ"];
    ___syscall_mincore = Module["___syscall_mincore"] = wasmExports["XQ"];
    ___syscall_pipe2 = Module["___syscall_pipe2"] = wasmExports["YQ"];
    ___syscall_pselect6 = Module["___syscall_pselect6"] = wasmExports["ZQ"];
    ___syscall_recvmmsg = Module["___syscall_recvmmsg"] = wasmExports["_Q"];
    ___syscall_sendmmsg = Module["___syscall_sendmmsg"] = wasmExports["$Q"];
    ___syscall_shutdown = Module["___syscall_shutdown"] = wasmExports["aR"];
    ___syscall_socketpair = Module["___syscall_socketpair"] = wasmExports["bR"];
    ___syscall_wait4 = Module["___syscall_wait4"] = wasmExports["cR"];
    ___cxa_atexit = Module["___cxa_atexit"] = wasmExports["dR"];
    ___cxa_finalize = Module["___cxa_finalize"] = wasmExports["eR"];
    ___cos = Module["___cos"] = wasmExports["fR"];
    ___cosdf = Module["___cosdf"] = wasmExports["gR"];
    ___emscripten_environ_constructor = Module["___emscripten_environ_constructor"] = wasmExports["hR"];
    ___fdopen = Module["___fdopen"] = wasmExports["nR"];
    _fdopen = Module["_fdopen"] = wasmExports["oR"];
    ___fmodeflags = Module["___fmodeflags"] = wasmExports["pR"];
    ___fpclassifyl = Module["___fpclassifyl"] = wasmExports["qR"];
    ___lockfile = Module["___lockfile"] = wasmExports["rR"];
    ___unlockfile = Module["___unlockfile"] = wasmExports["sR"];
    ___math_divzerof = Module["___math_divzerof"] = wasmExports["tR"];
    ___math_invalidf = Module["___math_invalidf"] = wasmExports["uR"];
    ___math_oflow = Module["___math_oflow"] = wasmExports["vR"];
    ___math_oflowf = Module["___math_oflowf"] = wasmExports["wR"];
    ___math_uflow = Module["___math_uflow"] = wasmExports["xR"];
    ___math_uflowf = Module["___math_uflowf"] = wasmExports["yR"];
    ___math_xflow = Module["___math_xflow"] = wasmExports["zR"];
    ___math_xflowf = Module["___math_xflowf"] = wasmExports["AR"];
    ___overflow = Module["___overflow"] = wasmExports["BR"];
    ___rem_pio2 = Module["___rem_pio2"] = wasmExports["CR"];
    ___rem_pio2_large = Module["___rem_pio2_large"] = wasmExports["DR"];
    ___rem_pio2f = Module["___rem_pio2f"] = wasmExports["ER"];
    ___sin = Module["___sin"] = wasmExports["FR"];
    ___sindf = Module["___sindf"] = wasmExports["GR"];
    ___stdio_close = Module["___stdio_close"] = wasmExports["HR"];
    ___aio_close = Module["___aio_close"] = wasmExports["IR"];
    ___stdio_exit = Module["___stdio_exit"] = wasmExports["JR"];
    ___stdio_exit_needed = Module["___stdio_exit_needed"] = wasmExports["NR"];
    ___stdio_read = Module["___stdio_read"] = wasmExports["OR"];
    ___stdio_seek = Module["___stdio_seek"] = wasmExports["PR"];
    ___stdio_write = Module["___stdio_write"] = wasmExports["QR"];
    ___tan = Module["___tan"] = wasmExports["RR"];
    ___tandf = Module["___tandf"] = wasmExports["SR"];
    ___toread = Module["___toread"] = wasmExports["TR"];
    ___toread_needs_stdio_exit = Module["___toread_needs_stdio_exit"] = wasmExports["UR"];
    ___towrite = Module["___towrite"] = wasmExports["VR"];
    ___towrite_needs_stdio_exit = Module["___towrite_needs_stdio_exit"] = wasmExports["WR"];
    ___tm_to_tzname = Module["___tm_to_tzname"] = wasmExports["XR"];
    _tzset = Module["_tzset"] = wasmExports["dS"];
    ___uflow = Module["___uflow"] = wasmExports["eS"];
    ___syscall_ret = Module["___syscall_ret"] = wasmExports["fS"];
    _sqrtf = Module["_sqrtf"] = wasmExports["gS"];
    _fabsf = Module["_fabsf"] = wasmExports["hS"];
    ___env_rm_add = Module["___env_rm_add"] = wasmExports["lS"];
    ___clock_gettime = Module["___clock_gettime"] = wasmExports["mS"];
    ___wasi_syscall_ret = Module["___wasi_syscall_ret"] = wasmExports["nS"];
    ___wasi_timestamp_to_timespec = Module["___wasi_timestamp_to_timespec"] = wasmExports["oS"];
    ___clock_nanosleep = Module["___clock_nanosleep"] = wasmExports["pS"];
    _clock_nanosleep = Module["_clock_nanosleep"] = wasmExports["qS"];
    _copysignl = Module["_copysignl"] = wasmExports["rS"];
    _floor = Module["_floor"] = wasmExports["sS"];
    ___dl_invalid_handle = Module["___dl_invalid_handle"] = wasmExports["vS"];
    ___get_tp = Module["___get_tp"] = wasmExports["wS"];
    ___dl_thread_cleanup = Module["___dl_thread_cleanup"] = wasmExports["xS"];
    ___dl_vseterr = Module["___dl_vseterr"] = wasmExports["yS"];
    ___libc_free = Module["___libc_free"] = wasmExports["zS"];
    ___libc_malloc = Module["___libc_malloc"] = wasmExports["AS"];
    _emscripten_get_heap_size = Module["_emscripten_get_heap_size"] = wasmExports["BS"];
    __emscripten_memcpy_bulkmem = Module["__emscripten_memcpy_bulkmem"] = wasmExports["CS"];
    __emscripten_memset_bulkmem = Module["__emscripten_memset_bulkmem"] = wasmExports["DS"];
    ___syscall_munmap = Module["___syscall_munmap"] = wasmExports["ES"];
    ___syscall_msync = Module["___syscall_msync"] = wasmExports["FS"];
    ___syscall_mmap2 = Module["___syscall_mmap2"] = wasmExports["GS"];
    ___time = Module["___time"] = wasmExports["HS"];
    ___gettimeofday = Module["___gettimeofday"] = wasmExports["IS"];
    _dysize = Module["_dysize"] = wasmExports["JS"];
    _vwarn = Module["_vwarn"] = wasmExports["KS"];
    _vwarnx = Module["_vwarnx"] = wasmExports["LS"];
    _verr = Module["_verr"] = wasmExports["MS"];
    _verrx = Module["_verrx"] = wasmExports["NS"];
    _warn = Module["_warn"] = wasmExports["OS"];
    _fprintf = Module["_fprintf"] = wasmExports["RS"];
    _perror = Module["_perror"] = wasmExports["SS"];
    _putc = Module["_putc"] = wasmExports["TS"];
    _err = Module["_err"] = wasmExports["US"];
    _errx = Module["_errx"] = wasmExports["VS"];
    _fabsl = Module["_fabsl"] = wasmExports["YS"];
    ___unlist_locked_file = Module["___unlist_locked_file"] = wasmExports["ZS"];
    ___ofl_lock = Module["___ofl_lock"] = wasmExports["_S"];
    ___ofl_unlock = Module["___ofl_unlock"] = wasmExports["$S"];
    _feof_unlocked = Module["_feof_unlocked"] = wasmExports["aT"];
    __IO_feof_unlocked = Module["__IO_feof_unlocked"] = wasmExports["bT"];
    _ferror_unlocked = Module["_ferror_unlocked"] = wasmExports["cT"];
    __IO_ferror_unlocked = Module["__IO_ferror_unlocked"] = wasmExports["dT"];
    _fflush_unlocked = Module["_fflush_unlocked"] = wasmExports["eT"];
    _emscripten_futex_wake = Module["_emscripten_futex_wake"] = wasmExports["fT"];
    ___floatscan = Module["___floatscan"] = wasmExports["gT"];
    _fmodl = Module["_fmodl"] = wasmExports["hT"];
    ___lseek = Module["___lseek"] = wasmExports["iT"];
    ___ofl_add = Module["___ofl_add"] = wasmExports["kT"];
    _vfiprintf = Module["_vfiprintf"] = wasmExports["lT"];
    ___small_fprintf = Module["___small_fprintf"] = wasmExports["mT"];
    ___small_vfprintf = Module["___small_vfprintf"] = wasmExports["nT"];
    _fputs_unlocked = Module["_fputs_unlocked"] = wasmExports["oT"];
    _fread_unlocked = Module["_fread_unlocked"] = wasmExports["pT"];
    _frexp = Module["_frexp"] = wasmExports["qT"];
    ___fseeko_unlocked = Module["___fseeko_unlocked"] = wasmExports["rT"];
    ___fseeko = Module["___fseeko"] = wasmExports["sT"];
    ___fstat = Module["___fstat"] = wasmExports["tT"];
    ___fstatat = Module["___fstatat"] = wasmExports["uT"];
    _fstatat = Module["_fstatat"] = wasmExports["vT"];
    ___ftello_unlocked = Module["___ftello_unlocked"] = wasmExports["wT"];
    ___ftello = Module["___ftello"] = wasmExports["xT"];
    ___fwritex = Module["___fwritex"] = wasmExports["yT"];
    _fwrite_unlocked = Module["_fwrite_unlocked"] = wasmExports["zT"];
    ___strchrnul = Module["___strchrnul"] = wasmExports["AT"];
    _emscripten_builtin_malloc = Module["_emscripten_builtin_malloc"] = wasmExports["BT"];
    _emscripten_stack_get_end = Module["_emscripten_stack_get_end"] = wasmExports["CT"];
    _emscripten_stack_get_base = Module["_emscripten_stack_get_base"] = wasmExports["DT"];
    ___h_errno_location = Module["___h_errno_location"] = wasmExports["ET"];
    _htonl = wasmExports["GT"];
    ___inet_aton = Module["___inet_aton"] = wasmExports["HT"];
    _inet_aton = Module["_inet_aton"] = wasmExports["IT"];
    ___intscan = Module["___intscan"] = wasmExports["KT"];
    ___isalnum_l = Module["___isalnum_l"] = wasmExports["LT"];
    _isalnum_l = Module["_isalnum_l"] = wasmExports["MT"];
    ___isblank_l = Module["___isblank_l"] = wasmExports["NT"];
    _isblank_l = Module["_isblank_l"] = wasmExports["OT"];
    ___iscntrl_l = Module["___iscntrl_l"] = wasmExports["PT"];
    _iscntrl_l = Module["_iscntrl_l"] = wasmExports["QT"];
    ___ispunct_l = Module["___ispunct_l"] = wasmExports["RT"];
    _ispunct_l = Module["_ispunct_l"] = wasmExports["ST"];
    ___isxdigit_l = Module["___isxdigit_l"] = wasmExports["TT"];
    _isxdigit_l = Module["_isxdigit_l"] = wasmExports["UT"];
    _emscripten_has_threading_support = Module["_emscripten_has_threading_support"] = wasmExports["WT"];
    _emscripten_num_logical_cores = Module["_emscripten_num_logical_cores"] = wasmExports["XT"];
    _emscripten_futex_wait = Module["_emscripten_futex_wait"] = wasmExports["YT"];
    _emscripten_main_thread_process_queued_calls = Module["_emscripten_main_thread_process_queued_calls"] = wasmExports["ZT"];
    _emscripten_current_thread_process_queued_calls = Module["_emscripten_current_thread_process_queued_calls"] = wasmExports["_T"];
    __emscripten_yield = Module["__emscripten_yield"] = wasmExports["$T"];
    __emscripten_check_timers = Module["__emscripten_check_timers"] = wasmExports["aU"];
    _pthread_mutex_init = Module["_pthread_mutex_init"] = wasmExports["bU"];
    ___pthread_mutex_lock = Module["___pthread_mutex_lock"] = wasmExports["cU"];
    ___pthread_mutex_unlock = Module["___pthread_mutex_unlock"] = wasmExports["dU"];
    ___pthread_mutex_trylock = Module["___pthread_mutex_trylock"] = wasmExports["eU"];
    ___pthread_mutex_timedlock = Module["___pthread_mutex_timedlock"] = wasmExports["fU"];
    _pthread_mutex_destroy = Module["_pthread_mutex_destroy"] = wasmExports["gU"];
    _pthread_mutex_consistent = Module["_pthread_mutex_consistent"] = wasmExports["hU"];
    _pthread_barrier_init = Module["_pthread_barrier_init"] = wasmExports["iU"];
    _pthread_barrier_destroy = Module["_pthread_barrier_destroy"] = wasmExports["jU"];
    _pthread_barrier_wait = Module["_pthread_barrier_wait"] = wasmExports["kU"];
    ___pthread_create = Module["___pthread_create"] = wasmExports["lU"];
    ___pthread_join = Module["___pthread_join"] = wasmExports["mU"];
    ___pthread_key_create = Module["___pthread_key_create"] = wasmExports["nU"];
    ___pthread_key_delete = Module["___pthread_key_delete"] = wasmExports["oU"];
    _pthread_getspecific = Module["_pthread_getspecific"] = wasmExports["pU"];
    _pthread_setspecific = Module["_pthread_setspecific"] = wasmExports["qU"];
    ___pthread_once = Module["___pthread_once"] = wasmExports["rU"];
    _pthread_cond_wait = Module["_pthread_cond_wait"] = wasmExports["sU"];
    _pthread_cond_signal = Module["_pthread_cond_signal"] = wasmExports["tU"];
    ___private_cond_signal = Module["___private_cond_signal"] = wasmExports["uU"];
    _pthread_cond_broadcast = Module["_pthread_cond_broadcast"] = wasmExports["vU"];
    _pthread_cond_init = Module["_pthread_cond_init"] = wasmExports["wU"];
    _pthread_cond_destroy = Module["_pthread_cond_destroy"] = wasmExports["xU"];
    ___pthread_cond_timedwait = Module["___pthread_cond_timedwait"] = wasmExports["yU"];
    _pthread_atfork = Module["_pthread_atfork"] = wasmExports["zU"];
    _pthread_cancel = Module["_pthread_cancel"] = wasmExports["AU"];
    _pthread_testcancel = Module["_pthread_testcancel"] = wasmExports["BU"];
    ___pthread_exit = Module["___pthread_exit"] = wasmExports["CU"];
    ___pthread_detach = Module["___pthread_detach"] = wasmExports["DU"];
    _pthread_equal = Module["_pthread_equal"] = wasmExports["EU"];
    _pthread_mutexattr_init = Module["_pthread_mutexattr_init"] = wasmExports["FU"];
    _pthread_mutexattr_setprotocol = Module["_pthread_mutexattr_setprotocol"] = wasmExports["GU"];
    _pthread_mutexattr_settype = Module["_pthread_mutexattr_settype"] = wasmExports["HU"];
    _pthread_mutexattr_destroy = Module["_pthread_mutexattr_destroy"] = wasmExports["IU"];
    _pthread_mutexattr_setpshared = Module["_pthread_mutexattr_setpshared"] = wasmExports["JU"];
    _pthread_condattr_init = Module["_pthread_condattr_init"] = wasmExports["KU"];
    _pthread_condattr_destroy = Module["_pthread_condattr_destroy"] = wasmExports["LU"];
    _pthread_condattr_setclock = Module["_pthread_condattr_setclock"] = wasmExports["MU"];
    _pthread_condattr_setpshared = Module["_pthread_condattr_setpshared"] = wasmExports["NU"];
    _pthread_setcancelstate = Module["_pthread_setcancelstate"] = wasmExports["OU"];
    _pthread_setcanceltype = Module["_pthread_setcanceltype"] = wasmExports["PU"];
    _pthread_rwlock_init = Module["_pthread_rwlock_init"] = wasmExports["QU"];
    _pthread_rwlock_destroy = Module["_pthread_rwlock_destroy"] = wasmExports["RU"];
    _pthread_rwlock_rdlock = Module["_pthread_rwlock_rdlock"] = wasmExports["SU"];
    _pthread_rwlock_tryrdlock = Module["_pthread_rwlock_tryrdlock"] = wasmExports["TU"];
    _pthread_rwlock_timedrdlock = Module["_pthread_rwlock_timedrdlock"] = wasmExports["UU"];
    _pthread_rwlock_wrlock = Module["_pthread_rwlock_wrlock"] = wasmExports["VU"];
    _pthread_rwlock_trywrlock = Module["_pthread_rwlock_trywrlock"] = wasmExports["WU"];
    _pthread_rwlock_timedwrlock = Module["_pthread_rwlock_timedwrlock"] = wasmExports["XU"];
    _pthread_rwlock_unlock = Module["_pthread_rwlock_unlock"] = wasmExports["YU"];
    _pthread_rwlockattr_init = Module["_pthread_rwlockattr_init"] = wasmExports["ZU"];
    _pthread_rwlockattr_destroy = Module["_pthread_rwlockattr_destroy"] = wasmExports["_U"];
    _pthread_rwlockattr_setpshared = Module["_pthread_rwlockattr_setpshared"] = wasmExports["$U"];
    _pthread_spin_init = Module["_pthread_spin_init"] = wasmExports["aV"];
    _pthread_spin_destroy = Module["_pthread_spin_destroy"] = wasmExports["bV"];
    _pthread_spin_lock = Module["_pthread_spin_lock"] = wasmExports["cV"];
    _pthread_spin_trylock = Module["_pthread_spin_trylock"] = wasmExports["dV"];
    _pthread_spin_unlock = Module["_pthread_spin_unlock"] = wasmExports["eV"];
    _sem_init = Module["_sem_init"] = wasmExports["fV"];
    _sem_post = Module["_sem_post"] = wasmExports["gV"];
    _sem_wait = Module["_sem_wait"] = wasmExports["hV"];
    _sem_trywait = Module["_sem_trywait"] = wasmExports["iV"];
    _sem_destroy = Module["_sem_destroy"] = wasmExports["jV"];
    ___wait = Module["___wait"] = wasmExports["kV"];
    ___lock = Module["___lock"] = wasmExports["lV"];
    ___unlock = Module["___unlock"] = wasmExports["mV"];
    ___acquire_ptc = Module["___acquire_ptc"] = wasmExports["nV"];
    ___release_ptc = Module["___release_ptc"] = wasmExports["oV"];
    _emscripten_thread_sleep = Module["_emscripten_thread_sleep"] = wasmExports["pV"];
    _pthread_mutex_lock = Module["_pthread_mutex_lock"] = wasmExports["qV"];
    _pthread_mutex_unlock = Module["_pthread_mutex_unlock"] = wasmExports["rV"];
    _pthread_mutex_trylock = Module["_pthread_mutex_trylock"] = wasmExports["sV"];
    _pthread_mutex_timedlock = Module["_pthread_mutex_timedlock"] = wasmExports["tV"];
    _emscripten_builtin_pthread_create = Module["_emscripten_builtin_pthread_create"] = wasmExports["uV"];
    _pthread_create = Module["_pthread_create"] = wasmExports["vV"];
    _emscripten_builtin_pthread_join = Module["_emscripten_builtin_pthread_join"] = wasmExports["wV"];
    _pthread_join = Module["_pthread_join"] = wasmExports["xV"];
    _pthread_key_delete = Module["_pthread_key_delete"] = wasmExports["yV"];
    _pthread_key_create = Module["_pthread_key_create"] = wasmExports["zV"];
    _pthread_once = Module["_pthread_once"] = wasmExports["AV"];
    _pthread_cond_timedwait = Module["_pthread_cond_timedwait"] = wasmExports["BV"];
    _emscripten_builtin_pthread_exit = Module["_emscripten_builtin_pthread_exit"] = wasmExports["CV"];
    _pthread_exit = Module["_pthread_exit"] = wasmExports["DV"];
    _emscripten_builtin_pthread_detach = Module["_emscripten_builtin_pthread_detach"] = wasmExports["EV"];
    _pthread_detach = Module["_pthread_detach"] = wasmExports["FV"];
    _thrd_detach = Module["_thrd_detach"] = wasmExports["GV"];
    ___get_locale = Module["___get_locale"] = wasmExports["HV"];
    ___localtime_r = Module["___localtime_r"] = wasmExports["KV"];
    ___lookup_name = Module["___lookup_name"] = wasmExports["MV"];
    _mbrtowc = Module["_mbrtowc"] = wasmExports["NV"];
    _mbsinit = Module["_mbsinit"] = wasmExports["OV"];
    ___memrchr = Module["___memrchr"] = wasmExports["PV"];
    _memrchr = Module["_memrchr"] = wasmExports["QV"];
    _timegm = Module["_timegm"] = wasmExports["RV"];
    ___gmtime_r = Module["___gmtime_r"] = wasmExports["SV"];
    _gmtime_r = Module["_gmtime_r"] = wasmExports["TV"];
    _localtime_r = Module["_localtime_r"] = wasmExports["UV"];
    _emscripten_builtin_free = Module["_emscripten_builtin_free"] = wasmExports["VV"];
    _emscripten_builtin_memalign = wasmExports["WV"];
    _printf = Module["_printf"] = wasmExports["ZV"];
    _emscripten_main_runtime_thread_id = Module["_emscripten_main_runtime_thread_id"] = wasmExports["cW"];
    __IO_putc = Module["__IO_putc"] = wasmExports["fW"];
    ___putenv = Module["___putenv"] = wasmExports["gW"];
    _putenv = Module["_putenv"] = wasmExports["hW"];
    ___qsort_r = Module["___qsort_r"] = wasmExports["iW"];
    _qsort_r = Module["_qsort_r"] = wasmExports["jW"];
    _scalbnl = Module["_scalbnl"] = wasmExports["kW"];
    _unsetenv = Module["_unsetenv"] = wasmExports["lW"];
    ___shlim = Module["___shlim"] = wasmExports["mW"];
    ___shgetc = Module["___shgetc"] = wasmExports["nW"];
    ___sigaction = Module["___sigaction"] = wasmExports["oW"];
    _bsd_signal = Module["_bsd_signal"] = wasmExports["qW"];
    ___sysv_signal = Module["___sysv_signal"] = wasmExports["rW"];
    _sprintf = Module["_sprintf"] = wasmExports["sW"];
    _vsiprintf = Module["_vsiprintf"] = wasmExports["tW"];
    ___small_sprintf = Module["___small_sprintf"] = wasmExports["uW"];
    ___small_vsprintf = Module["___small_vsprintf"] = wasmExports["vW"];
    ___isoc99_sscanf = Module["___isoc99_sscanf"] = wasmExports["wW"];
    ___stpcpy = Module["___stpcpy"] = wasmExports["yW"];
    _stpcpy = Module["_stpcpy"] = wasmExports["zW"];
    ___stpncpy = Module["___stpncpy"] = wasmExports["AW"];
    _stpncpy = Module["_stpncpy"] = wasmExports["BW"];
    ___strcasecmp_l = Module["___strcasecmp_l"] = wasmExports["CW"];
    _strcasecmp_l = Module["_strcasecmp_l"] = wasmExports["DW"];
    _strchrnul = Module["_strchrnul"] = wasmExports["EW"];
    ___strerror_l = Module["___strerror_l"] = wasmExports["FW"];
    _strerror_l = Module["_strerror_l"] = wasmExports["GW"];
    _strnlen = Module["_strnlen"] = wasmExports["HW"];
    ___strncasecmp_l = Module["___strncasecmp_l"] = wasmExports["IW"];
    _strncasecmp_l = Module["_strncasecmp_l"] = wasmExports["JW"];
    _strtof = Module["_strtof"] = wasmExports["KW"];
    ___trunctfsf2 = Module["___trunctfsf2"] = wasmExports["LW"];
    ___extendsftf2 = Module["___extendsftf2"] = wasmExports["MW"];
    ___floatsitf = Module["___floatsitf"] = wasmExports["NW"];
    ___multf3 = Module["___multf3"] = wasmExports["OW"];
    ___addtf3 = Module["___addtf3"] = wasmExports["PW"];
    ___extenddftf2 = Module["___extenddftf2"] = wasmExports["QW"];
    ___getf2 = Module["___getf2"] = wasmExports["RW"];
    ___netf2 = Module["___netf2"] = wasmExports["SW"];
    ___floatunsitf = Module["___floatunsitf"] = wasmExports["TW"];
    ___subtf3 = Module["___subtf3"] = wasmExports["UW"];
    ___divtf3 = Module["___divtf3"] = wasmExports["VW"];
    ___eqtf2 = Module["___eqtf2"] = wasmExports["WW"];
    ___letf2 = Module["___letf2"] = wasmExports["XW"];
    ___trunctfdf2 = Module["___trunctfdf2"] = wasmExports["YW"];
    _strtold = Module["_strtold"] = wasmExports["ZW"];
    ___multi3 = Module["___multi3"] = wasmExports["_W"];
    _strtoimax = Module["_strtoimax"] = wasmExports["$W"];
    _strtoumax = Module["_strtoumax"] = wasmExports["aX"];
    ___strtol_internal = Module["___strtol_internal"] = wasmExports["bX"];
    ___strtoul_internal = Module["___strtoul_internal"] = wasmExports["cX"];
    ___strtoll_internal = Module["___strtoll_internal"] = wasmExports["dX"];
    ___strtoull_internal = Module["___strtoull_internal"] = wasmExports["eX"];
    ___strtoimax_internal = Module["___strtoimax_internal"] = wasmExports["fX"];
    ___strtoumax_internal = Module["___strtoumax_internal"] = wasmExports["gX"];
    ___tolower_l = Module["___tolower_l"] = wasmExports["hX"];
    _tolower_l = Module["_tolower_l"] = wasmExports["iX"];
    ___toupper_l = Module["___toupper_l"] = wasmExports["jX"];
    _toupper_l = Module["_toupper_l"] = wasmExports["kX"];
    _towlower = Module["_towlower"] = wasmExports["lX"];
    _towupper = Module["_towupper"] = wasmExports["mX"];
    ___towupper_l = Module["___towupper_l"] = wasmExports["nX"];
    ___towlower_l = Module["___towlower_l"] = wasmExports["oX"];
    _towupper_l = Module["_towupper_l"] = wasmExports["pX"];
    _towlower_l = Module["_towlower_l"] = wasmExports["qX"];
    ___vfprintf_internal = Module["___vfprintf_internal"] = wasmExports["rX"];
    _wctomb = Module["_wctomb"] = wasmExports["sX"];
    _vfscanf = Module["_vfscanf"] = wasmExports["tX"];
    ___isoc99_vfscanf = Module["___isoc99_vfscanf"] = wasmExports["uX"];
    _vsniprintf = Module["_vsniprintf"] = wasmExports["vX"];
    ___small_vsnprintf = Module["___small_vsnprintf"] = wasmExports["wX"];
    ___isoc99_vsscanf = Module["___isoc99_vsscanf"] = wasmExports["xX"];
    ___wasi_fd_is_valid = Module["___wasi_fd_is_valid"] = wasmExports["yX"];
    _wcrtomb = Module["_wcrtomb"] = wasmExports["zX"];
    _wcschr = Module["_wcschr"] = wasmExports["AX"];
    _wmemcmp = Module["_wmemcmp"] = wasmExports["BX"];
    _wmemchr = Module["_wmemchr"] = wasmExports["CX"];
    _sbrk = Module["_sbrk"] = wasmExports["DX"];
    _emscripten_builtin_realloc = Module["_emscripten_builtin_realloc"] = wasmExports["EX"];
    _emscripten_builtin_calloc = Module["_emscripten_builtin_calloc"] = wasmExports["FX"];
    ___libc_calloc = Module["___libc_calloc"] = wasmExports["GX"];
    ___libc_realloc = Module["___libc_realloc"] = wasmExports["HX"];
    _realloc_in_place = Module["_realloc_in_place"] = wasmExports["IX"];
    _memalign = Module["_memalign"] = wasmExports["JX"];
    _posix_memalign = Module["_posix_memalign"] = wasmExports["KX"];
    _valloc = Module["_valloc"] = wasmExports["LX"];
    _pvalloc = Module["_pvalloc"] = wasmExports["MX"];
    _mallinfo = Module["_mallinfo"] = wasmExports["NX"];
    _mallopt = Module["_mallopt"] = wasmExports["OX"];
    _malloc_trim = Module["_malloc_trim"] = wasmExports["PX"];
    _malloc_usable_size = Module["_malloc_usable_size"] = wasmExports["QX"];
    _malloc_footprint = Module["_malloc_footprint"] = wasmExports["RX"];
    _malloc_max_footprint = Module["_malloc_max_footprint"] = wasmExports["SX"];
    _malloc_footprint_limit = Module["_malloc_footprint_limit"] = wasmExports["TX"];
    _malloc_set_footprint_limit = Module["_malloc_set_footprint_limit"] = wasmExports["UX"];
    _independent_calloc = Module["_independent_calloc"] = wasmExports["VX"];
    _independent_comalloc = Module["_independent_comalloc"] = wasmExports["WX"];
    _bulk_free = Module["_bulk_free"] = wasmExports["XX"];
    _emscripten_get_sbrk_ptr = Module["_emscripten_get_sbrk_ptr"] = wasmExports["YX"];
    __sbrk64 = Module["__sbrk64"] = wasmExports["ZX"];
    _brk = Module["_brk"] = wasmExports["_X"];
    ___ashlti3 = Module["___ashlti3"] = wasmExports["aY"];
    ___lshrti3 = Module["___lshrti3"] = wasmExports["bY"];
    ___fe_getround = Module["___fe_getround"] = wasmExports["cY"];
    ___fe_raise_inexact = Module["___fe_raise_inexact"] = wasmExports["dY"];
    ___unordtf2 = Module["___unordtf2"] = wasmExports["eY"];
    ___lttf2 = Module["___lttf2"] = wasmExports["fY"];
    ___gttf2 = Module["___gttf2"] = wasmExports["gY"];
    _setThrew = wasmExports["hY"];
    ___get_temp_ret = Module["___get_temp_ret"] = wasmExports["iY"];
    ___set_temp_ret = Module["___set_temp_ret"] = wasmExports["jY"];
    _emscripten_stack_init = Module["_emscripten_stack_init"] = wasmExports["kY"];
    _emscripten_stack_set_limits = Module["_emscripten_stack_set_limits"] = wasmExports["lY"];
    _emscripten_stack_get_free = Module["_emscripten_stack_get_free"] = wasmExports["mY"];
    __emscripten_stack_restore = wasmExports["nY"];
    __emscripten_stack_alloc = wasmExports["oY"];
    _emscripten_stack_get_current = wasmExports["pY"];
    _gethostbyname2 = Module["_gethostbyname2"] = wasmExports["qY"];
    _gethostbyname2_r = Module["_gethostbyname2_r"] = wasmExports["rY"];
    memory = wasmMemory = wasmExports["ne"];
    ___stack_pointer = Module["___stack_pointer"] = wasmExports["pe"];
    _Fs = Module["_Fs"] = wasmExports["xe"].value;
    ___THREW__ = Module["___THREW__"] = wasmExports["Qe"].value;
    ___threwValue = Module["___threwValue"] = wasmExports["Re"].value;
    __indirect_function_table = wasmTable = wasmExports["Xe"];
    _thrd_drv = Module["_thrd_drv"] = wasmExports["gf"].value;
    _thrd_pwd = Module["_thrd_pwd"] = wasmExports["hf"].value;
    _stderr = Module["_stderr"] = wasmExports["Uf"].value;
    _aiwnios_logo = Module["_aiwnios_logo"] = wasmExports["Rg"].value;
    _arg_bootstrap_bin = Module["_arg_bootstrap_bin"] = wasmExports["bh"].value;
    _arg_cmd_line = Module["_arg_cmd_line"] = wasmExports["ch"].value;
    _arg_cmd_line2 = Module["_arg_cmd_line2"] = wasmExports["eh"].value;
    _arg_help = Module["_arg_help"] = wasmExports["sh"].value;
    _arg_overwrite = Module["_arg_overwrite"] = wasmExports["th"].value;
    _arg_t_dir = Module["_arg_t_dir"] = wasmExports["vh"].value;
    _arg_asan_enable = Module["_arg_asan_enable"] = wasmExports["wh"].value;
    _arg_new_boot_dir = Module["_arg_new_boot_dir"] = wasmExports["xh"].value;
    _arg_fork = Module["_arg_fork"] = wasmExports["yh"].value;
    _arg_pidfile = Module["_arg_pidfile"] = wasmExports["zh"].value;
    _arg_grab = Module["_arg_grab"] = wasmExports["Ah"].value;
    _arg_no_debug = Module["_arg_no_debug"] = wasmExports["Bh"].value;
    _sixty_fps = Module["_sixty_fps"] = wasmExports["Ch"].value;
    _arg_boot_files = Module["_arg_boot_files"] = wasmExports["Eh"].value;
    _arg_s = Module["_arg_s"] = wasmExports["Fh"].value;
    _arg_fast_fail = Module["_arg_fast_fail"] = wasmExports["Gh"].value;
    _stdout = Module["_stdout"] = wasmExports["Jh"].value;
    _sdl_window_grab_enable = Module["_sdl_window_grab_enable"] = wasmExports["Nh"].value;
    _user_ev_num = Module["_user_ev_num"] = wasmExports["_h"].value;
    _glbl_table = Module["_glbl_table"] = wasmExports["gi"].value;
    _opterr = Module["_opterr"] = wasmExports["uo"].value;
    _optind = Module["_optind"] = wasmExports["vo"].value;
    _optarg = Module["_optarg"] = wasmExports["xo"].value;
    _optopt = Module["_optopt"] = wasmExports["yo"].value;
    _optreset = Module["_optreset"] = wasmExports["No"].value;
    _stdin = Module["_stdin"] = wasmExports["Uo"].value;
    _EMSCRIPTENAUDIO_bootstrap = Module["_EMSCRIPTENAUDIO_bootstrap"] = wasmExports["mw"].value;
    _DISKAUDIO_bootstrap = Module["_DISKAUDIO_bootstrap"] = wasmExports["ow"].value;
    _DUMMYAUDIO_bootstrap = Module["_DUMMYAUDIO_bootstrap"] = wasmExports["pw"].value;
    _SDL_Convert_S8_to_F32 = Module["_SDL_Convert_S8_to_F32"] = wasmExports["ix"].value;
    _SDL_Convert_U8_to_F32 = Module["_SDL_Convert_U8_to_F32"] = wasmExports["jx"].value;
    _SDL_Convert_S16_to_F32 = Module["_SDL_Convert_S16_to_F32"] = wasmExports["kx"].value;
    _SDL_Convert_U16_to_F32 = Module["_SDL_Convert_U16_to_F32"] = wasmExports["lx"].value;
    _SDL_Convert_S32_to_F32 = Module["_SDL_Convert_S32_to_F32"] = wasmExports["mx"].value;
    _SDL_Convert_F32_to_S8 = Module["_SDL_Convert_F32_to_S8"] = wasmExports["ox"].value;
    _SDL_Convert_F32_to_U8 = Module["_SDL_Convert_F32_to_U8"] = wasmExports["px"].value;
    _SDL_Convert_F32_to_S16 = Module["_SDL_Convert_F32_to_S16"] = wasmExports["qx"].value;
    _SDL_Convert_F32_to_U16 = Module["_SDL_Convert_F32_to_U16"] = wasmExports["rx"].value;
    _SDL_Convert_F32_to_S32 = Module["_SDL_Convert_F32_to_S32"] = wasmExports["sx"].value;
    _SDL_GeneratedBlitFuncTable = Module["_SDL_GeneratedBlitFuncTable"] = wasmExports["Hx"].value;
    _SDL_DUMMY_SensorDriver = Module["_SDL_DUMMY_SensorDriver"] = wasmExports["wy"].value;
    _Emscripten_bootstrap = Module["_Emscripten_bootstrap"] = wasmExports["$y"].value;
    _SDL_EMSCRIPTEN_JoystickDriver = Module["_SDL_EMSCRIPTEN_JoystickDriver"] = wasmExports["BC"].value;
    _SDL_joystick_magic = Module["_SDL_joystick_magic"] = wasmExports["IC"].value;
    _SDL_expand_byte = Module["_SDL_expand_byte"] = wasmExports["KF"].value;
    _GLES2_RenderDriver = Module["_GLES2_RenderDriver"] = wasmExports["mG"].value;
    _SW_RenderDriver = Module["_SW_RenderDriver"] = wasmExports["nG"].value;
    ___environ = Module["___environ"] = wasmExports["iR"].value;
    ____environ = Module["____environ"] = wasmExports["jR"].value;
    __environ = Module["__environ"] = wasmExports["kR"].value;
    _environ = Module["_environ"] = wasmExports["lR"].value;
    ___tls_base = Module["___tls_base"] = wasmExports["mR"].value;
    ___stdin_used = Module["___stdin_used"] = wasmExports["KR"].value;
    ___stdout_used = Module["___stdout_used"] = wasmExports["LR"].value;
    ___stderr_used = Module["___stderr_used"] = wasmExports["MR"].value;
    _timezone = Module["_timezone"] = wasmExports["YR"].value;
    _daylight = Module["_daylight"] = wasmExports["ZR"].value;
    ___tzname = Module["___tzname"] = wasmExports["_R"].value;
    ___timezone = Module["___timezone"] = wasmExports["$R"].value;
    ___daylight = Module["___daylight"] = wasmExports["aS"].value;
    ___utc = Module["___utc"] = wasmExports["bS"].value;
    _tzname = Module["_tzname"] = wasmExports["cS"].value;
    ___c_dot_utf8 = Module["___c_dot_utf8"] = wasmExports["iS"].value;
    ___c_locale = Module["___c_locale"] = wasmExports["jS"].value;
    ___c_dot_utf8_locale = Module["___c_dot_utf8_locale"] = wasmExports["kS"].value;
    ___default_stacksize = Module["___default_stacksize"] = wasmExports["tS"].value;
    ___default_guardsize = Module["___default_guardsize"] = wasmExports["uS"].value;
    ___progname = Module["___progname"] = wasmExports["PS"].value;
    ___stderr_FILE = Module["___stderr_FILE"] = wasmExports["QS"].value;
    ___exp_data = Module["___exp_data"] = wasmExports["WS"].value;
    ___exp2f_data = Module["___exp2f_data"] = wasmExports["XS"].value;
    ___libc = Module["___libc"] = wasmExports["jT"].value;
    _h_errno = Module["_h_errno"] = wasmExports["FT"].value;
    ___fsmu8 = Module["___fsmu8"] = wasmExports["JT"].value;
    ___hwcap = Module["___hwcap"] = wasmExports["VT"].value;
    ___locale_lock = Module["___locale_lock"] = wasmExports["IV"].value;
    ___locale_lockptr = Module["___locale_lockptr"] = wasmExports["JV"].value;
    ___logf_data = Module["___logf_data"] = wasmExports["LV"].value;
    ___stdio_ofl_lockptr = Module["___stdio_ofl_lockptr"] = wasmExports["XV"].value;
    ___powf_log2_data = Module["___powf_log2_data"] = wasmExports["YV"].value;
    ___stdout_FILE = Module["___stdout_FILE"] = wasmExports["_V"].value;
    ___progname_full = Module["___progname_full"] = wasmExports["$V"].value;
    _program_invocation_short_name = Module["_program_invocation_short_name"] = wasmExports["aW"].value;
    _program_invocation_name = Module["_program_invocation_name"] = wasmExports["bW"].value;
    ___stack_high = Module["___stack_high"] = wasmExports["dW"].value;
    ___stack_low = Module["___stack_low"] = wasmExports["eW"].value;
    ___sig_actions = Module["___sig_actions"] = wasmExports["pW"].value;
    ___stdin_FILE = Module["___stdin_FILE"] = wasmExports["xW"].value;
    ___heap_base = Module["___heap_base"] = wasmExports["$X"].value;
    ___dso_handle = Module["___dso_handle"] = wasmExports["sY"].value;
    ___data_end = Module["___data_end"] = wasmExports["tY"].value;
    ___global_base = Module["___global_base"] = wasmExports["uY"].value;
    ___heap_end = Module["___heap_end"] = wasmExports["vY"].value;
    ___memory_base = Module["___memory_base"] = wasmExports["wY"].value;
    ___table_base = Module["___table_base"] = wasmExports["xY"].value;
    ___wasm_first_page_end = Module["___wasm_first_page_end"] = wasmExports["yY"].value
}
var wasmImports = {
    d: ___assert_fail,
    eb: ___syscall__newselect,
    ab: ___syscall_accept4,
    $a: ___syscall_bind,
    Fb: ___syscall_chmod,
    _a: ___syscall_connect,
    Gb: ___syscall_faccessat,
    k: ___syscall_fcntl64,
    Cb: ___syscall_fstat64,
    yb: ___syscall_ftruncate64,
    ib: ___syscall_getdents64,
    p: ___syscall_ioctl,
    Ya: ___syscall_listen,
    zb: ___syscall_lstat64,
    tb: ___syscall_mkdirat,
    Ab: ___syscall_newfstatat,
    V: ___syscall_openat,
    kb: ___syscall_poll,
    Wa: ___syscall_recvfrom,
    gb: ___syscall_renameat,
    Q: ___syscall_rmdir,
    Va: ___syscall_sendto,
    P: ___syscall_socket,
    Bb: ___syscall_stat64,
    cb: ___syscall_truncate64,
    hb: ___syscall_unlinkat,
    Hb: __abort_js,
    le: __emscripten_fs_load_embedded_files,
    jb: __emscripten_get_progname,
    Za: __emscripten_lookup_name,
    bb: __emscripten_throw_longjmp,
    ob: __gmtime_js,
    pb: __localtime_js,
    qb: __mktime_js,
    lb: __mmap_js,
    mb: __msync_js,
    nb: __munmap_js,
    rb: __timegm_js,
    sb: __tzset_js,
    Eb: _clock_time_get,
    fb: _eglBindAPI,
    Mb: _eglChooseConfig,
    Ma: _eglCreateContext,
    Oa: _eglCreateWindowSurface,
    Na: _eglDestroyContext,
    Pa: _eglDestroySurface,
    Xb: _eglGetConfigAttrib,
    R: _eglGetDisplay,
    La: _eglGetError,
    xb: _eglInitialize,
    Qa: _eglMakeCurrent,
    Ka: _eglQueryString,
    Ra: _eglSwapBuffers,
    Sa: _eglSwapInterval,
    Db: _eglTerminate,
    Xa: _eglWaitGL,
    Ua: _eglWaitNative,
    g: _emscripten_asm_const_int,
    a: _emscripten_asm_const_int_sync_on_main_thread,
    Ia: _emscripten_asm_const_ptr_sync_on_main_thread,
    K: _emscripten_cancel_main_loop,
    gc: _emscripten_clear_timeout,
    W: _emscripten_date_now,
    Ea: _emscripten_exit_fullscreen,
    Ha: _emscripten_exit_pointerlock,
    ae: _emscripten_force_exit,
    i: _emscripten_get_device_pixel_ratio,
    f: _emscripten_get_element_css_size,
    _: _emscripten_get_gamepad_status,
    db: _emscripten_get_heap_max,
    S: _emscripten_get_now,
    xd: _emscripten_get_num_gamepads,
    Ja: _emscripten_get_screen_size,
    ka: _emscripten_glActiveTexture,
    ja: _emscripten_glAttachShader,
    Aa: _emscripten_glBeginQueryEXT,
    ia: _emscripten_glBindAttribLocation,
    ha: _emscripten_glBindBuffer,
    ga: _emscripten_glBindFramebuffer,
    fa: _emscripten_glBindRenderbuffer,
    ea: _emscripten_glBindTexture,
    sa: _emscripten_glBindVertexArrayOES,
    da: _emscripten_glBlendColor,
    ca: _emscripten_glBlendEquation,
    ba: _emscripten_glBlendEquationSeparate,
    aa: _emscripten_glBlendFunc,
    ke: _emscripten_glBlendFuncSeparate,
    je: _emscripten_glBufferData,
    ie: _emscripten_glBufferSubData,
    he: _emscripten_glCheckFramebufferStatus,
    ge: _emscripten_glClear,
    fe: _emscripten_glClearColor,
    ee: _emscripten_glClearDepthf,
    de: _emscripten_glClearStencil,
    Jb: _emscripten_glClipControlEXT,
    ce: _emscripten_glColorMask,
    be: _emscripten_glCompileShader,
    $d: _emscripten_glCompressedTexImage2D,
    _d: _emscripten_glCompressedTexSubImage2D,
    Zd: _emscripten_glCopyTexImage2D,
    Yd: _emscripten_glCopyTexSubImage2D,
    Xd: _emscripten_glCreateProgram,
    Wd: _emscripten_glCreateShader,
    Vd: _emscripten_glCullFace,
    Ud: _emscripten_glDeleteBuffers,
    Td: _emscripten_glDeleteFramebuffers,
    Sd: _emscripten_glDeleteProgram,
    Ca: _emscripten_glDeleteQueriesEXT,
    Rd: _emscripten_glDeleteRenderbuffers,
    Qd: _emscripten_glDeleteShader,
    Pd: _emscripten_glDeleteTextures,
    ra: _emscripten_glDeleteVertexArraysOES,
    Od: _emscripten_glDepthFunc,
    Nd: _emscripten_glDepthMask,
    Md: _emscripten_glDepthRangef,
    Ld: _emscripten_glDetachShader,
    Kd: _emscripten_glDisable,
    Jd: _emscripten_glDisableVertexAttribArray,
    Id: _emscripten_glDrawArrays,
    na: _emscripten_glDrawArraysInstancedANGLE,
    oa: _emscripten_glDrawBuffersWEBGL,
    Hd: _emscripten_glDrawElements,
    ma: _emscripten_glDrawElementsInstancedANGLE,
    Gd: _emscripten_glEnable,
    Fd: _emscripten_glEnableVertexAttribArray,
    za: _emscripten_glEndQueryEXT,
    Ed: _emscripten_glFinish,
    Dd: _emscripten_glFlush,
    Cd: _emscripten_glFramebufferRenderbuffer,
    Bd: _emscripten_glFramebufferTexture2D,
    Ad: _emscripten_glFrontFace,
    zd: _emscripten_glGenBuffers,
    wd: _emscripten_glGenFramebuffers,
    Da: _emscripten_glGenQueriesEXT,
    vd: _emscripten_glGenRenderbuffers,
    ud: _emscripten_glGenTextures,
    qa: _emscripten_glGenVertexArraysOES,
    yd: _emscripten_glGenerateMipmap,
    td: _emscripten_glGetActiveAttrib,
    sd: _emscripten_glGetActiveUniform,
    rd: _emscripten_glGetAttachedShaders,
    qd: _emscripten_glGetAttribLocation,
    pd: _emscripten_glGetBooleanv,
    od: _emscripten_glGetBufferParameteriv,
    nd: _emscripten_glGetError,
    md: _emscripten_glGetFloatv,
    ld: _emscripten_glGetFramebufferAttachmentParameteriv,
    kd: _emscripten_glGetIntegerv,
    id: _emscripten_glGetProgramInfoLog,
    jd: _emscripten_glGetProgramiv,
    ua: _emscripten_glGetQueryObjecti64vEXT,
    wa: _emscripten_glGetQueryObjectivEXT,
    ta: _emscripten_glGetQueryObjectui64vEXT,
    va: _emscripten_glGetQueryObjectuivEXT,
    xa: _emscripten_glGetQueryivEXT,
    hd: _emscripten_glGetRenderbufferParameteriv,
    fd: _emscripten_glGetShaderInfoLog,
    ed: _emscripten_glGetShaderPrecisionFormat,
    dd: _emscripten_glGetShaderSource,
    gd: _emscripten_glGetShaderiv,
    cd: _emscripten_glGetString,
    bd: _emscripten_glGetTexParameterfv,
    ad: _emscripten_glGetTexParameteriv,
    Zc: _emscripten_glGetUniformLocation,
    $c: _emscripten_glGetUniformfv,
    _c: _emscripten_glGetUniformiv,
    Wc: _emscripten_glGetVertexAttribPointerv,
    Yc: _emscripten_glGetVertexAttribfv,
    Xc: _emscripten_glGetVertexAttribiv,
    Vc: _emscripten_glHint,
    Uc: _emscripten_glIsBuffer,
    Tc: _emscripten_glIsEnabled,
    Sc: _emscripten_glIsFramebuffer,
    Rc: _emscripten_glIsProgram,
    Ba: _emscripten_glIsQueryEXT,
    Qc: _emscripten_glIsRenderbuffer,
    Pc: _emscripten_glIsShader,
    Oc: _emscripten_glIsTexture,
    pa: _emscripten_glIsVertexArrayOES,
    Nc: _emscripten_glLineWidth,
    Mc: _emscripten_glLinkProgram,
    Lc: _emscripten_glPixelStorei,
    Ib: _emscripten_glPolygonModeWEBGL,
    Kc: _emscripten_glPolygonOffset,
    Kb: _emscripten_glPolygonOffsetClampEXT,
    ya: _emscripten_glQueryCounterEXT,
    Jc: _emscripten_glReadPixels,
    Ic: _emscripten_glReleaseShaderCompiler,
    Hc: _emscripten_glRenderbufferStorage,
    Gc: _emscripten_glSampleCoverage,
    Fc: _emscripten_glScissor,
    Ec: _emscripten_glShaderBinary,
    Dc: _emscripten_glShaderSource,
    Cc: _emscripten_glStencilFunc,
    Bc: _emscripten_glStencilFuncSeparate,
    Ac: _emscripten_glStencilMask,
    zc: _emscripten_glStencilMaskSeparate,
    yc: _emscripten_glStencilOp,
    xc: _emscripten_glStencilOpSeparate,
    wc: _emscripten_glTexImage2D,
    vc: _emscripten_glTexParameterf,
    uc: _emscripten_glTexParameterfv,
    tc: _emscripten_glTexParameteri,
    sc: _emscripten_glTexParameteriv,
    rc: _emscripten_glTexSubImage2D,
    qc: _emscripten_glUniform1f,
    pc: _emscripten_glUniform1fv,
    oc: _emscripten_glUniform1i,
    nc: _emscripten_glUniform1iv,
    mc: _emscripten_glUniform2f,
    lc: _emscripten_glUniform2fv,
    kc: _emscripten_glUniform2i,
    jc: _emscripten_glUniform2iv,
    ic: _emscripten_glUniform3f,
    hc: _emscripten_glUniform3fv,
    fc: _emscripten_glUniform3i,
    ec: _emscripten_glUniform3iv,
    dc: _emscripten_glUniform4f,
    cc: _emscripten_glUniform4fv,
    bc: _emscripten_glUniform4i,
    ac: _emscripten_glUniform4iv,
    $b: _emscripten_glUniformMatrix2fv,
    _b: _emscripten_glUniformMatrix3fv,
    Zb: _emscripten_glUniformMatrix4fv,
    Yb: _emscripten_glUseProgram,
    Wb: _emscripten_glValidateProgram,
    Vb: _emscripten_glVertexAttrib1f,
    Ub: _emscripten_glVertexAttrib1fv,
    Tb: _emscripten_glVertexAttrib2f,
    Sb: _emscripten_glVertexAttrib2fv,
    Rb: _emscripten_glVertexAttrib3f,
    Qb: _emscripten_glVertexAttrib3fv,
    Pb: _emscripten_glVertexAttrib4f,
    Ob: _emscripten_glVertexAttrib4fv,
    la: _emscripten_glVertexAttribDivisorANGLE,
    Nb: _emscripten_glVertexAttribPointer,
    Lb: _emscripten_glViewport,
    r: _emscripten_has_asyncify,
    Fa: _emscripten_request_fullscreen_strategy,
    O: _emscripten_request_pointerlock,
    j: _emscripten_resize_heap,
    $: _emscripten_sample_gamepad_data,
    s: _emscripten_set_beforeunload_callback_on_thread,
    F: _emscripten_set_blur_callback_on_thread,
    h: _emscripten_set_canvas_element_size,
    n: _emscripten_set_element_css_size,
    G: _emscripten_set_focus_callback_on_thread,
    v: _emscripten_set_fullscreenchange_callback_on_thread,
    Z: _emscripten_set_gamepadconnected_callback_on_thread,
    Y: _emscripten_set_gamepaddisconnected_callback_on_thread,
    y: _emscripten_set_keydown_callback_on_thread,
    w: _emscripten_set_keypress_callback_on_thread,
    x: _emscripten_set_keyup_callback_on_thread,
    Ta: _emscripten_set_main_loop,
    M: _emscripten_set_mousedown_callback_on_thread,
    J: _emscripten_set_mouseenter_callback_on_thread,
    I: _emscripten_set_mouseleave_callback_on_thread,
    N: _emscripten_set_mousemove_callback_on_thread,
    L: _emscripten_set_mouseup_callback_on_thread,
    A: _emscripten_set_pointerlockchange_callback_on_thread,
    u: _emscripten_set_resize_callback_on_thread,
    X: _emscripten_set_timeout,
    B: _emscripten_set_touchcancel_callback_on_thread,
    D: _emscripten_set_touchend_callback_on_thread,
    C: _emscripten_set_touchmove_callback_on_thread,
    E: _emscripten_set_touchstart_callback_on_thread,
    t: _emscripten_set_visibilitychange_callback_on_thread,
    H: _emscripten_set_wheel_callback_on_thread,
    Ga: _emscripten_set_window_title,
    q: _emscripten_sleep,
    vb: _environ_get,
    wb: _environ_sizes_get,
    b: _exit,
    l: _fd_close,
    T: _fd_fdstat_get,
    U: _fd_read,
    ub: _fd_seek,
    o: _fd_write,
    z: _getaddrinfo,
    c: invoke_iii,
    me: invoke_iji,
    m: invoke_j,
    e: invoke_ji
};

function invoke_iji(index, a1, a2) {
    var sp = stackSave();
    try {
        return getWasmTableEntry(index)(a1, a2)
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0)
    }
}

function invoke_j(index) {
    var sp = stackSave();
    try {
        return getWasmTableEntry(index)()
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
        return 0n
    }
}

function invoke_iii(index, a1, a2) {
    var sp = stackSave();
    try {
        return getWasmTableEntry(index)(a1, a2)
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0)
    }
}

function invoke_ji(index, a1) {
    var sp = stackSave();
    try {
        return getWasmTableEntry(index)(a1)
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
        return 0n
    }
}

function callMain(args = []) {
    var entryFunction = _main;
    args.unshift(thisProgram);
    var argc = args.length;
    var argv = stackAlloc((argc + 1) * 4);
    var argv_ptr = argv;
    for (var arg of args) {
        HEAPU32[argv_ptr >> 2] = stringToUTF8OnStack(arg);
        argv_ptr += 4
    }
    HEAPU32[argv_ptr >> 2] = 0;
    try {
        var ret = entryFunction(argc, argv);
        exitJS(ret, true);
        return ret
    } catch (e) {
        return handleException(e)
    }
}

function run(args = arguments_) {
    if (runDependencies > 0) {
        dependenciesFulfilled = run;
        return
    }
    preRun();
    if (runDependencies > 0) {
        dependenciesFulfilled = run;
        return
    }

    function doRun() {
        Module["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        preMain();
        Module["onRuntimeInitialized"]?.();
        var noInitialRun = Module["noInitialRun"] || false;
        if (!noInitialRun) callMain(args);
        postRun()
    }
    if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(() => {
            setTimeout(() => Module["setStatus"](""), 1);
            doRun()
        }, 1)
    } else {
        doRun()
    }
}
var wasmExports;
createWasm();
run();