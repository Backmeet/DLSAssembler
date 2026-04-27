function toSigned(v, bits) {
    const m = 1 << (bits - 1)
    return v & m ? v - (1 << bits) : v
}

let numberParseError = false
let numberParseErrorLine = 0

function parseNumber(v, i) {
    if (typeof v !== "string") return Number(v)

    v = v.trim()
    
    let o = 0

    if (v.startsWith("0b")) o = parseInt(v.slice(2), 2)
    else if (v.startsWith("0x")) o = parseInt(v, 16)
    else o = parseInt(v, 10)

    if (o === -1) numberParseError = true
    if (numberParseError) numberParseErrorLine = i 
    return o
}

function formatOutput(bytes, mode) {

    function ensureEven(arr) {
        if (arr.length % 2 !== 0) arr.push(0)
        return arr
    }

    let out = []

    if (mode === "binary8") {
        return bytes.map(b => b.toString(2).padStart(8, "0")).join("\n")
    }

    if (mode === "binary16") {
        const a = ensureEven([...bytes])
        for (let i = 0; i < a.length; i += 2) {
            const v = (a[i + 1] << 8) | a[i]
            out.push(v.toString(2).padStart(16, "0"))
        }
        return out.join("\n")
    }

    if (mode === "hex2") {
        return bytes.map(b => "0x" + b.toString(16).padStart(2, "0")).join("\n")
    }

    if (mode === "hex4") {
        const a = ensureEven([...bytes])
        for (let i = 0; i < a.length; i += 2) {
            const v = (a[i + 1] << 8) | a[i]
            out.push("0x" + v.toString(16).padStart(4, "0"))
        }
        return out.join("\n")
    }

    if (mode === "unsigned8") {
        return bytes.join("\n")
    }

    if (mode === "signed8") {
        return bytes.map(b => toSigned(b, 8)).join("\n")
    }

    if (mode === "unsigned16") {
        const a = ensureEven([...bytes])
        for (let i = 0; i < a.length; i += 2) {
            out.push(((a[i + 1] << 8) | a[i]) >>> 0)
        }
        return out.join("\n")
    }

    if (mode === "signed16") {
        const a = ensureEven([...bytes])
        for (let i = 0; i < a.length; i += 2) {
            out.push(toSigned((a[i + 1] << 8) | a[i], 16))
        }
        return out.join("\n")
    }

    return ""
}

function updateOutput(bytes, error, msg) {
    if (!error) {
        const mode = document.getElementById("outputMode").value
        document.getElementById("outputBox").value = formatOutput(bytes, mode)
    } else {
        document.getElementById("outputBox").value = msg
    }
}

let editor

require.config({
    paths: {
        vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs"
    }
})

let instructionCache = {}

function refreshInstructionCache() {
    const list = document.querySelectorAll("#instructionList li span")
    const map = {}

    for (const item of list) {
        const parts = item.textContent.split("=")
        if (parts.length !== 2) continue
        map[parts[0].trim()] = parseInt(parts[1].trim())
    }
    
    instructionCache = map
}

require(["vs/editor/editor.main"], function () {

    monaco.languages.register({ id: "asmcustom" })

    class State {
        constructor() {}
        clone() {
            return new State()
        }
        equals(other) {
            return other instanceof State
        }
    }
    
    const directives = new Set([
        ".romsize",
        ".org",
        ".string",
        ".stringz",
        ".array"
    ])

    function isDirective(word) {
        return directives.has(word)
    }

    monaco.languages.setTokensProvider("asmcustom", {

        getInitialState: function () {
            return new State(true, false, false)
        },

        tokenize: function (line, state) {

            const tokens = []
            let i = 0
            let first = true

            function push(start, type) {
                tokens.push({ startIndex: start, scopes: type })
            }

            while (i < line.length) {

                if (/\s/.test(line[i])) {
                    i++
                    continue
                }

                const start = i

                /* comment */
                if (line[i] === ";") {
                    push(i, "comment")
                    return { tokens, endState: new State(first, false, false) }
                }

                /* strings */
                if (line[i] === '"' || line[i] === "'") {
                    const q = line[i++]
                    while (i < line.length && line[i] !== q) i++
                    i++
                    push(start, "string")
                    first = false
                    continue
                }

                /* rel() blocks */
                if (line[i] === "(") {
                    push(i, "rel")
                    i++
                    first = false
                    continue
                }

                if (line[i] === ")") {
                    push(i, "rel")
                    i++
                    first = false
                    continue
                }

                /* formatted value: [format, value] */
                if (line[i] === "[") {
                    push(i, "bracket") // [
                    i++
                    push(i, "format")  // 16b
                    while (i < line.length && line[i] !== ",") i++

                    push(i, "plaintext") // ,
                    i++
                
                    while (line[i] === " ") i++ // " "

                    continue
                }

                if (line[i] === "]") {
                    push(i, "bracket")

                    i++
                    first = false
                    continue
                }

                /* numbers */
                if (/[0-9]/.test(line[i])) {
                    while (i < line.length && /[0-9xA-Fa-f]/.test(line[i])) i++
                    push(start, "number")
                    first = false
                    continue
                }

                /* words */
                if (/[A-Za-z_.@]/.test(line[i])) {

                    while (i < line.length && /[A-Za-z0-9_@.()]/.test(line[i])) i++

                    const word = line.slice(start, i+1).trim()

                    if (word.endsWith(":")) {
                        push(start, "labeldef")
                        first = false
                        continue
                    }

                    if (isDirective(word)) {
                        push(start, "directive")
                        first = false
                        continue
                    }

                    if (instructionCache[word] !== undefined) {
                        push(start, first ? "opcode" : "operand")
                    } else {
                        push(start, "operand")
                    }

                    first = false
                    continue
                }

                i++
            }

            return { tokens, endState: new State() }
        }
    })
        
    monaco.editor.defineTheme("asmTheme", {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "opcode"   , foreground: "ff5555" },
            { token: "operand"  , foreground: "60d060" },

            { token: "number"   , foreground: "45c0a7" },
            { token: "string"   , foreground: "5fa8ff" },
            { token: "rel"      , foreground: "ffa64d" },

            { token: "plaintext", foreground: "ffffff" },
            { token: "bracket"  , foreground: "ffa64d" },
            { token: "format"   , foreground: "5fa8ff" },

            { token: "directive", foreground: "ffa64d" },


            { token: "labeldef" , foreground: "ffa64d" },

            { token: "comment"  , foreground: "777777" }

        ],
        colors: {
            "editor.foreground": "#ffffff",
            "editor.background": "#1e1e1e"
        }
    })

    editor = monaco.editor.create(
        document.getElementById("editor"),
        {
            value:
`; fibanaci
loadri a 0
loadri b 1
loadri c 0
loop:
  alurrr add a b c
  loadrr a b
  port p1 b
  loadrr b c
  jmp loop

; hello, world
loadri a 0
loop:
alurrr or a a a 
jz loopend
loadr@(ri) b a msg
load@ir 0xFF b
load@ii 0xFE 1
jmp loop
loopend:

; find biggest
loadri c 0 ; biggest
loadri b 0
loop1:
loadr@(ri) a b array 
alurir sub a 0xFF d
jz loopend1
alurrr sub a c d
jc else_smaller
if_bigger:
loadrr c a
else_smaller:
alurir add b 1 b 
jmp loop1
loopend1:



data:
msg:
.stringz "Hello, world"
array:
.array 0 1 2 5 7 23 255 ; 255 marks end
`,
            language: "asmcustom",
            theme: "asmTheme",
            automaticLayout: true,
            fontSize: 18,
            lineHeight: 26,
            minimap: { enabled: true }
        }
    )

    editor.onDidChangeModelContent(function () {
        assemble()
    })

    refreshInstructionCache()
    assemble()

    window.refreshInstructionCache = refreshInstructionCache
})

function parseInstructions() {
    const list = document.querySelectorAll("#instructionList li span")
    const map = {}

    for (const item of list) {
        const parts = item.textContent.split("=")
        if (parts.length !== 2) continue
        map[parts[0].trim()] = parts[1].trim()
    }

    return map
}

function resolveOpcode(token, instructions, lineIndex, pushByte, labels) {

    let visited = new Set()
    let current = token

    while (true) {

        if (visited.has(current)) {
            numberParseError = true
            numberParseErrorLine = lineIndex
            return true
        }

        visited.add(current)

        /* formatted value */
        if (typeof current === "string" && current.startsWith("[") && current.endsWith("]")) {
            emitFormatted(current, pushByte, lineIndex, instructions, labels)
            return true
        }

        /* numeric */
        const n = parseNumber(current, lineIndex)
        if (!Number.isNaN(n)) {
            pushByte(n)
            return true
        }

        /* opcode reference */
        const next = instructions[current]
        if (next === undefined) return false

        current = next
    }
}

function emitFormatted(token, pushByte, lineIndex, instructions, labels) {

    if (!token.startsWith("[") || !token.endsWith("]")) return false

    const inner = token.slice(1, -1)
    const parts = inner.split(",")

    if (parts.length !== 2) {
        numberParseError = true
        numberParseErrorLine = lineIndex
        return true
    }

    let format = parts[0].trim()
    let value = parts[1].trim()

    const bIndex = format.indexOf("b")
    if (bIndex === -1) {
        numberParseError = true
        numberParseErrorLine = lineIndex
        return true
    }

    const bitwidthRaw = format.slice(0, bIndex)
    let bitwidth = parseNumber(bitwidthRaw, lineIndex)

    let visited = new Set()

    while (true) {

        if (visited.has(value)) {
            numberParseError = true
            numberParseErrorLine = lineIndex
            return true
        }

        visited.add(value)

        if (labels[value] !== undefined) {
            value = labels[value]
            break
        }

        const next = instructions[value]
        if (next !== undefined) {
            value = next
            continue
        }

        break
    }

    let v = parseNumber(value, lineIndex)

    while (bitwidth % 8 !== 0) bitwidth++

    const numBytes = bitwidth / 8

    const bytes = []
    let tmp = v >>> 0

    while (tmp > 0) {
        bytes.unshift(tmp & 0xFF)
        tmp = tmp >>> 8
    }

    if (bytes.length === 0) bytes.push(0)

    while (bytes.length < numBytes) bytes.unshift(0)

    for (let i = numBytes - 1; i != -1; i--) {
        pushByte(bytes[i])
    }

    return true
}

function assemble() {
    if (!editor) return

    const instructions = parseInstructions()
    const program = editor.getValue().split("\n")

    const labels = {}
    let pc = 0
    let romSize = null

    const output = []
    let overflow = false

    function pushByte(v) {
        v &= 0xFF

        if (romSize !== null && output.length >= romSize) {
            overflow = true
            return
        }

        output.push(v)
        pc++
    }

    function fillTo(addr) {
        while (pc < addr) {
            pushByte(0)
        }
    }

    /* FIRST PASS */
    pc = 0

    for (let i = 0; i < program.length; i++) {
        let l = program[i].trim()
        if (!l) continue

        const parts = l.match(/\[[^\]]*\]|\S+/g) || []
        const head = parts[0]

        if (head.endsWith(":")) {
            labels[head.slice(0, -1)] = pc
            continue
        }

        if (head === ".romsize") {
            romSize = parseNumber(parts[1], i)
            continue
        }

        if (head === ".org") {
            const target = parseNumber(parts[1], i)
            if (!Number.isNaN(target)) {
                pc = target
            }
            continue
        }

        if (head === ".string" || head === ".stringz") {
            const str = l.slice(l.indexOf(parts[1]))
                .replace(/^['"]|['"]$/g, "")

            pc += str.length + (head === ".stringz" ? 1 : 0)
            continue
        }

        if (head === ".array") {

            for (let j = 1; j < parts.length; j++) {

                const t = parts[j]

                if (t.startsWith("[") && t.endsWith("]")) {

                    const inner = t.slice(1, -1).split(",")
                    if (inner.length === 2) {

                        const fmt = inner[0].trim()
                        const bIndex = fmt.indexOf("b")

                        if (bIndex !== -1) {
                            let bits = parseNumber(fmt.slice(0, bIndex), i)
                            while (bits % 8 !== 0) bits++
                            pc += bits / 8
                            continue
                        }
                    }
                }

                pc += 1
            }

            continue
        }

        if (instructions[head] === undefined) continue

        pc += 1

        for (let j = 1; j < parts.length; j++) {

            const t = parts[j]

            if (t.startsWith("[") && t.endsWith("]")) {

                const inner = t.slice(1, -1).split(",")
                if (inner.length === 2) {

                    const fmt = inner[0].trim()
                    const bIndex = fmt.indexOf("b")

                    if (bIndex !== -1) {
                        let bits = parseNumber(fmt.slice(0, bIndex), i)
                        while (bits % 8 !== 0) bits++
                        pc += bits / 8
                        continue
                    }
                }
            }

            pc += 1
        }
    }

    /* reset for second pass */
    pc = 0

    /* SECOND PASS */
    for (let i = 0; i < program.length; i++) {
        let l = program[i].trim()
        if (!l) continue

        const parts = l.match(/\[[^\]]*\]|\S+/g) || []
        const head = parts[0]

        if (head.endsWith(":")) continue

        if (head === ".romsize") continue

        if (head === ".org") {
            const target = parseNumber(parts[1], i)
            if (!Number.isNaN(target)) {
                fillTo(target)
            }
            continue
        }

        if (head === ".string" || head === ".stringz") {
            const str = l.slice(l.indexOf(parts[1]))
                .replace(/^['"]|['"]$/g, "")

            for (const c of str) pushByte(c.charCodeAt(0))
            if (head === ".stringz") pushByte(0)
            continue
        }

        if (head === ".array") {
            for (let j = 1; j < parts.length; j++) {

                const t = parts[j]

                if (emitFormatted(t, pushByte, i, instructions, labels)) continue

                pushByte(parseNumber(t, i))
            }
            continue
        }

        for (let j = 0; j < parts.length; j++) {

            const a = parts[j]

            if (resolveOpcode(a, instructions, i, pushByte, labels)) {
                continue
            }

            if (emitFormatted(a, pushByte, i, instructions, labels)) continue

            if (labels[a] !== undefined) {
                pushByte(labels[a])
                continue
            }

            const n = parseNumber(a, i)
            if (!Number.isNaN(n)) pushByte(n)
        }
    }

    /* ROM SIZE FINALIZATION */
    if (romSize !== null) {
        while (output.length < romSize) {
            output.push(0)
        }

        if (output.length > romSize) {
            overflow = true
        }
    }

    let error = ""
    if (overflow) {
        error += "Error: Exceeded memory flow, (your program is bigger than .romsize tells)"
    } else if (numberParseError) {
        error += "Error: A invalid number @" + toString(numberParseErrorLine) 
    }


    updateOutput(output, overflow || numberParseError, error)
}

const outputMode = document.getElementById("outputMode")
outputMode.onchange = () => assemble()

function refreshHighlight() {
    if (!editor) return
    const model = editor.getModel()
    monaco.editor.setModelLanguage(model, "plaintext")
    monaco.editor.setModelLanguage(model, "asmcustom")
}

function addInstructionDefinition(name, number) {
    name = name.trim()
    number = number.trim()

    if (name === "" || number === "") return
    const li = document.createElement("li")

    const span = document.createElement("span")
    span.textContent = name + " = " + number

    const btn = document.createElement("button")
    btn.className = "remove-btn"
    btn.textContent = "✕"

    btn.onclick = function () {
        li.remove()
        refreshInstructionCache()
        refreshHighlight()
        assemble()
    }

    li.appendChild(span)
    li.appendChild(btn)
    list.appendChild(li)

    refreshInstructionCache()
    refreshHighlight()
    assemble()
}

const addBtn = document.getElementById("addInstruction")
const nameBox = document.getElementById("nameBox")
const numberBox = document.getElementById("numberBox")
const list = document.getElementById("instructionList")

addBtn.onclick = function () {
    addInstructionDefinition(nameBox.value, numberBox.value)

    nameBox.value = ""
    numberBox.value = ""
}

const clearBtn = document.getElementById("clearBtn")
const saveBtn = document.getElementById("saveBtn")
const loadBtn = document.getElementById("loadBtn")
const saveNameBox = document.getElementById("save_name")
const loadDropdown = document.getElementById("load_dropdown")

function getInstructionDefs(){
    const defs = []
    const spans = document.querySelectorAll("#instructionList li span")
    for(const s of spans){
        const parts = s.textContent.split("=")
        if(parts.length!==2) continue
        defs.push({
            name:parts[0].trim(),
            number:parts[1].trim()
        })
    }
    return defs
}

function setInstructionDefs(defs){
    list.innerHTML = ""
    for(const d of defs){
        addInstructionDefinition(d.name,String(d.number))
    }
}

function updateSaveDropdown(){
    loadDropdown.innerHTML = ""

    for(let i=0;i<localStorage.length;i++){
        const key = localStorage.key(i)

        if(!key.startsWith("asm_save_")) continue

        const name = key.replace("asm_save_","")

        const opt = document.createElement("option")
        opt.value = name
        opt.textContent = name

        loadDropdown.appendChild(opt)
    }
}

clearBtn.onclick = function(){

    list.innerHTML = ""
    refreshInstructionCache()

    if(editor) editor.setValue("")

    refreshHighlight()
    assemble()
}

saveBtn.onclick = function(){

    const name = saveNameBox.value.trim()
    if(name==="") return

    const data = {
        program: editor.getValue(),
        instructions: getInstructionDefs()
    }

    localStorage.setItem(
        "asm_save_"+name,
        JSON.stringify(data)
    )

    updateSaveDropdown()
}

loadBtn.onclick = function(){

    const name = loadDropdown.value
    if(!name) return

    const raw = localStorage.getItem("asm_save_"+name)
    if(!raw) return

    const data = JSON.parse(raw)

    if(data.program!==undefined){
        editor.setValue(data.program)
    }

    if(Array.isArray(data.instructions)){
        setInstructionDefs(data.instructions)
    }

    refreshInstructionCache()
    refreshHighlight()
    assemble()
}

updateSaveDropdown()

// base definations

refreshInstructionCache()

addInstructionDefinition("loadri"    , "0")
addInstructionDefinition("loadrr"    , "1")

addInstructionDefinition("load@ii"   , "2")
addInstructionDefinition("load@ir"   , "3")

addInstructionDefinition("loadr@i"   , "4")

addInstructionDefinition("load@(ri)r", "5")
addInstructionDefinition("loadr@(ri)", "6")

addInstructionDefinition("load@(rr)r", "7")
addInstructionDefinition("loadr@(rr)", "8")

addInstructionDefinition("alurrr"    , "9")
addInstructionDefinition("alurir"    , "10")
addInstructionDefinition("alurr"     , "11")

addInstructionDefinition("jz"        , "12")
addInstructionDefinition("jnz"       , "13")
addInstructionDefinition("jc"        , "14")

addInstructionDefinition("jmp"       , "15")
addInstructionDefinition("jmp@(rr)"  , "16")

addInstructionDefinition("port"      , "17")

addInstructionDefinition("add"   , "0")
addInstructionDefinition("sub"   , "1")
addInstructionDefinition("or"    , "2")
addInstructionDefinition("and"   , "3")
addInstructionDefinition("xor"   , "4")
addInstructionDefinition("lshift", "5")
addInstructionDefinition("rshift", "6")


addInstructionDefinition("a", "0")
addInstructionDefinition("b", "1")
addInstructionDefinition("c", "2")
addInstructionDefinition("d", "3")
addInstructionDefinition("e", "4")
addInstructionDefinition("f", "5")

addInstructionDefinition("p1", "0")
addInstructionDefinition("p2", "1")
addInstructionDefinition("p3", "2")
addInstructionDefinition("p4", "3")


const copyBtn = document.getElementById("copyBtn")
const outputBox = document.getElementById("outputBox")

copyBtn.onclick = async () => {
    try {
        await navigator.clipboard.writeText(outputBox.value)

        copyBtn.textContent = "Copied"
        copyBtn.classList.add("copied")

        setTimeout(() => {
            copyBtn.textContent = "Copy"
            copyBtn.classList.remove("copied")
        }, 1200)

    } catch {
        outputBox.select()
        document.execCommand("copy")
    }
}