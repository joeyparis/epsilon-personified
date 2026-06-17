import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scripts_dir = join(process.cwd(), 'scripts')

describe('scanner launchd assets', () => {
  it('defines a MOI user LaunchAgent template with local endpoint and log paths only', async () => {
    const plist = await readFile(join(scripts_dir, 'com.joey.moi.epsilon-scanner-intake.plist.tmpl'), 'utf8')

    expect(plist).toContain('com.joey.moi.epsilon-scanner-intake')
    expect(plist).toContain('http://127.0.0.1:4097')
    expect(plist).toContain('<key>PATH</key>')
    expect(plist).toContain('/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')
    expect(plist).toContain('<key>SCANNER_OPENCODE_MODEL</key>')
    expect(plist).toContain('opencode/gpt-5.5')
    expect(plist).toContain('<key>SCANNER_SOURCE_MODE</key>')
    expect(plist).toContain('gmail')
    expect(plist).toContain('<key>SCANNER_AUTH_MODE</key>')
    expect(plist).toContain('iam-sign-jwt')
    expect(plist).toContain('moi-gmail-scanner@epsilon-490315.iam.gserviceaccount.com')
    expect(plist).toContain('mail@joeyparis.me')
    expect(plist).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect(plist).toContain('/Users/joey/.config/gcloud-personal')
    expect(plist).toContain('<key>GCLOUD_CONFIGURATION</key>')
    expect(plist).toContain('/Users/joey/Library/Logs/epsilon-scanner-intake.log')
    expect(plist).toContain('/Users/joey/Library/Logs/epsilon-scanner-intake-error.log')
    expect(plist).not.toContain('<key>Sockets</key>')
  })

  it('keeps installer and uninstaller dry-run by default with explicit mutation flags', async () => {
    const installer = await readFile(join(scripts_dir, 'install-scanner-intake-launchd.sh'), 'utf8')
    const uninstaller = await readFile(join(scripts_dir, 'uninstall-scanner-intake-launchd.sh'), 'utf8')

    expect(installer).toContain('--install')
    expect(installer).toContain('Dry run: would')
    expect(installer).toContain('launchctl bootstrap')
    expect(uninstaller).toContain('--uninstall')
    expect(uninstaller).toContain('Dry run: would')
    expect(uninstaller).toContain('launchctl bootout')
  })
})
