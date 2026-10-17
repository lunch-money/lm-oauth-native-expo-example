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
    const text = readFileSync('env.example', 'utf8')
    expect(text).toContain(
      'EXPO_PUBLIC_LUNCH_MONEY_CLIENT_ID=YOUR_PUBLIC_CLIENT_ID',
    )
    expect(text).not.toMatch(/CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN/)
  })

  it('uses IPv4 localhost for the iOS Simulator development client', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    for (const script of [
      packageJson.scripts.ios,
      packageJson.scripts['ios:metro'],
    ]) {
      expect(script).toContain('NODE_OPTIONS=--dns-result-order=ipv4first')
      expect(script).toContain('--localhost')
    }
  })

  it('clears resource output across authorization and budget transitions', () => {
    const controller = readFileSync('src/scaffolding/useOAuthDemo.ts', 'utf8')
    expect(controller).toContain('setHideStoredConnections(true)')
    expect(controller).toContain('setHideStoredConnections(false)')
    expect(controller).toContain('connectionStatusForDisplay(')
    expect(controller).toMatch(
      /async function act[\s\S]*setBusy\(true\)\s+setProfile\(null\)/,
    )
    expect(controller).toContain('const result = await workflow.authorize()')
    expect(controller).toContain(
      'workflow.selectConnection(connection.accountId)',
    )
  })

  it('logs only allowlisted OAuth failure diagnostics', () => {
    const controller = readFileSync('src/scaffolding/useOAuthDemo.ts', 'utf8')
    expect(controller).toContain('...safeOAuthErrorDiagnostic(error)')
    expect(controller).toContain("'oauth.authorization.failed'")
    expect(controller).toContain("'oauth.me.failed'")
    expect(controller).not.toContain('JSON.stringify(error)')
  })

  it('keeps the local-only forget action explicit and confirmed', () => {
    const screen = readFileSync('src/scaffolding/AppScreen.tsx', 'utf8')
    const connectionCard = readFileSync(
      'src/scaffolding/components/ConnectionCard.tsx',
      'utf8',
    )
    expect(connectionCard).toContain('Forget local credential only')
    expect(screen).toContain(
      'The remote Lunch Money authorization remains active.',
    )
    expect(screen).toContain('confirmForgetLocalCredential()')
  })

  it('uses a compact accessible selector for multiple visible budgets', () => {
    const selector = readFileSync(
      'src/scaffolding/components/BudgetSelector.tsx',
      'utf8',
    )
    expect(selector).toContain('<Modal')
    expect(selector).toContain('onRequestClose={onClose}')
    expect(selector).toContain('accessibilityRole="radio"')
    expect(selector).toContain('<ActionButton')
    expect(selector).toContain('label="Cancel"')
    expect(selector).not.toContain('Switch budget')
  })
})
