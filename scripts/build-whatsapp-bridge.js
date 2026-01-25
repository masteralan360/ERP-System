import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

// Target binary name for Windows (Tauri triplet)
const TARGET_TRIPLET = 'x86_64-pc-windows-msvc'
const TARGET_BIN = `whatsapp-bridge-${TARGET_TRIPLET}.exe`

const SOURCE_DIR = path.join(rootDir, 'whatsapp-bridge')
const OUTPUT_DIR = path.join(rootDir, 'src-tauri')

async function build() {
    console.log('🚀 Starting WhatsApp Bridge Sidecar Build...')

    if (!fs.existsSync(OUTPUT_DIR)) {
        console.log(`📁 Creating directory: ${OUTPUT_DIR}`)
        fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    }

    try {
        // Step 1: Bundle with esbuild to handle ESM dependencies
        console.log('📦 Step 1: Bundling with esbuild...')
        execSync('npx esbuild index.js --bundle --platform=node --target=node18 --outfile=dist/bundle.js', {
            cwd: SOURCE_DIR,
            stdio: 'inherit'
        })

        // Step 2: Compile the bundle with pkg
        console.log('📦 Step 2: Compiling to binary with pkg...')
        const outputExe = path.join(SOURCE_DIR, 'whatsapp-bridge.exe')

        execSync('npx pkg dist/bundle.js --targets node18-win-x64 --output whatsapp-bridge.exe', {
            cwd: SOURCE_DIR,
            stdio: 'inherit'
        })

        // Step 3: Move and Rename to match Tauri's triplet requirement
        const finalPath = path.join(OUTPUT_DIR, TARGET_BIN)

        if (fs.existsSync(outputExe)) {
            console.log(`🚚 Moving binary to sidecar location...`)
            fs.copyFileSync(outputExe, finalPath)

            // Cleanup temporary exe
            fs.unlinkSync(outputExe)

            console.log('\n✅ Build Successful!')
            console.log(`📍 Sidecar located at: ${finalPath}`)
            console.log('\nNext Step: Run "npm run tauri dev" to test the integration.')
        } else {
            throw new Error('Binary was not generated correctly.')
        }
    } catch (err) {
        console.error('\n❌ Build Failed:', err.message)
        process.exit(1)
    }
}

build()
