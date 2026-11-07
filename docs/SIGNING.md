# Code signing

Local Dashboard ships as an **unsigned** Windows installer by default. Signing is opt-in: the build
configuration supports it, but nothing is signed unless a certificate is present at build time.

## Why sign

Without a code-signing certificate, Windows SmartScreen shows *"Windows protected your PC"* the first
time someone runs the installer. The user must click **More info → Run anyway**. Signing removes (or
greatly reduces) that warning and proves the build came from the publisher.

## Get a certificate

1. Buy an **OV (Organization Validation)** or **EV (Extended Validation)** code-signing certificate.
   EV certificates need a hardware token (USB key); OV certificates are usually delivered as a `.pfx`
   file. Individual developers can use an OV certificate registered to a sole trader or company.
2. Common vendors include Sectigo, DigiCert and SSL.com. An OV certificate is enough for SmartScreen
   to build reputation; an EV certificate builds it faster.
3. You receive a `.pfx` (`.p12`) file and a password for it. Keep both secret — anyone with the key
   can sign builds in your name.

## Configure the build

`electron-builder` reads the certificate from these environment variables:

| Variable | Meaning |
| --- | --- |
| `CSC_LINK` | Path to the `.pfx` (`.p12`) file, or a base64-encoded copy of it |
| `CSC_KEY_PASSWORD` | The password for the certificate |

Set them for the `dist` run only; never commit them to the repository or to `.env`.

```powershell
$env:CSC_LINK = "C:\signing\certificate.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
npm run dist
```

The build already configures the timestamp server and hash algorithm, so a signed build embeds a
trusted RFC 3161 timestamp and signs with SHA-256:

```json
"win": {
  "signtoolOptions": {
    "rfc3161TimeStampServer": "http://timestamp.digicert.com",
    "signingHashAlgorithms": ["sha256"]
  }
}
```

`CSC_LINK` and `CSC_KEY_PASSWORD` are picked up automatically by `electron-builder`; no code change
is needed.

## Verify a build

After `npm run dist`, confirm the signature on the produced artifacts:

```powershell
Get-AuthenticodeSignature .\release\Local-Dashboard-Setup-1.17.0.exe
```

A signed build reports `Valid`. An unsigned build reports `NotSigned` — this is the default.

SmartScreen reputation builds up over time as the same certificate signs more releases. New
certificates may still trigger the warning for the first few builds, especially the portable `.exe`
which is seen by Windows more often than the installer.

## Signing and auto-update

Auto-update works without signing, but SmartScreen can flag each downloaded update. A signed build
means the updater's downloads are trusted the same way as the first install. The updater is opt-in:
it never runs in **Local only** mode and can be turned off under **Settings → Application → Check for
updates automatically**.
