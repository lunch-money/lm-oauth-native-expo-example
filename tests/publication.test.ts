import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('public repository boundaries', () => {
  const files = () =>
    execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)

  it('does not contain preview hostnames or real-looking OAuth credentials', () => {
    const forbiddenHosts = [
      ['api-alpha', 'lunchmoney', 'dev'].join('.'),
      ['alpha', 'lunchmoney', 'app'].join('.'),
      ['oauth-preview', 'lunchmoney', 'dev'].join('.'),
    ]
    const matches = files().flatMap((file) => {
      if (/package-lock\.json$/.test(file)) return []
      const text = readFileSync(file, 'utf8')
      return forbiddenHosts
        .filter((host) => text.includes(host))
        .map((host) => `${file}: ${host}`)
    })
    expect(matches).toEqual([])
  })

  it('keeps React, routing, styles, and scaffolding out of the OAuth teaching core', () => {
    const source = files()
      .filter((file) => file.startsWith('src/oauth/') && file.endsWith('.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    expect(source).not.toMatch(/from ['"](?:react|react-native|expo-router)/)
    expect(source).not.toContain('../scaffolding/')
  })

  it('ships public placeholders without a secret field', () => {
    const text = readFileSync('config.example', 'utf8')
    expect(text).toContain(
      'EXPO_PUBLIC_LUNCH_MONEY_CLIENT_ID=YOUR_PUBLIC_CLIENT_ID',
    )
    expect(text).not.toMatch(/CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN/)
  })
})
