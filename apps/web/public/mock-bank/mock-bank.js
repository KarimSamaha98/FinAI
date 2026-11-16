/**
 * Mock bank for testing the extension's recorder + replay locally (no real
 * bank touched). The sign-on hash route mimics CIBC's SPA: the login URL we
 * hand to the engine is `/#auth/signon`; successful sign-on walks the hash
 * #mockscreen so the worker's isLoginUrl() leaves the login state, exactly
 * like `#/auth/signon` → dashboard on the real site.
 */

function show(id) {
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === id))
}

function setHash(part) {
  if (location.hash !== part) location.hash = part
}

const ROWS = [
  ['2026-11-02', 'WALMART SUPERC', '34.11', ''],
  ['2026-11-01', 'PAYROLL DEPOSIT', '', '2450.00'],
  ['2026-10-30', 'LIBRARY CAFE', '6.25', ''],
  ['2026-10-30', 'TRANSIT CARD TOPUP', '22.50', ''],
  ['2026-10-29', 'MUSIC STREAMING', '', '12.99'],
]

function renderRows() {
  const table = document.getElementById('txtable')
  const header = `<tr><td>Header</td><td></td><td></td><td></td></tr><tr><td>Date</td><td>Description</td><td>Debit</td><td>Credit</td></tr>`
  table.innerHTML =
    header + ROWS.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`).join('')
}

// Bank pattern: the sign-on flow starts on the bank's public site and then
// redirects to the real online-banking host. Both hosts are subdomains of
// the same registrable domain (www.mock-bank.test → online.mock-bank.test),
// so the single up-front domain-family grant covers the whole journey —
// exactly like cibc.com → cibconline.cibc.com.
document.getElementById('btn-signon')?.addEventListener('click', () => {
  // Public-site hosts redirect to their online-banking host. Two variants:
  //  - www.mock-bank.test → online.mock-bank.test (same registrable domain —
  //    covered by the single up-front wildcard grant, no mid-flow prompt);
  //  - mock-cibc.test → mock-cibconline.test (cross-registrable — the ONE
  //    case where a mid-flow grant appears).
  if (location.hostname === 'www.mock-bank.test') {
    location.href = 'http://online.mock-bank.test:5173/mock-bank/index.html'
    return
  }
  if (location.hostname === 'mock-cibc.test') {
    location.href = 'http://mock-cibconline.test:5173/mock-bank/index.html'
    return
  }
  show('screen-mfa')
  setHash('#mock-mfa')
})

document.getElementById('btn-mfa')?.addEventListener('click', () => {
  const otp = document.getElementById('otpCode')
  if (otp && otp.value.trim().length >= 4) {
    show('screen-home')
    renderRows()
    setHash('#mock-home')
  } else {
    alert('Mock bank: enter any 4+ digit code (demo: 246810)')
  }
})

// Data-URL export: some banks build the CSV client-side and trigger a
// download from a data: URL (or POST into a blank frame) — Chrome reports
// such downloads with an unresolvable origin ("null") and no filename.
document.getElementById('btn-download-data')?.addEventListener('click', () => {
  const csv = 'Date,Description,Debit,Credit\n2026-11-08,DATA URL EXPORT,42.50,\n2026-11-07,DATA URL DEPOSIT,,100.00'
  const anchor = document.createElement('a')
  anchor.href = 'data:text/csv;base64,' + btoa(csv)
  anchor.download = 'eq-style-export.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
})

document.getElementById('btn-signout')?.addEventListener('click', () => {
  show('screen-login')
  setHash('#auth/signon')
})

// Direct-URL export: a plain navigation to a same-origin .csv file — no blob,
// no anchor — exactly how banks that stream the file from an endpoint
// (Content-Disposition) behave. Caught via downloads.onCreated.
document.getElementById('btn-download-direct')?.addEventListener('click', () => {
  location.href = 'export.csv'
})

// The export: blob CSV download, exactly the shape the CIBC card profile
// expects (headerless, Date, Description, Debit, Credit — dual columns).
document.getElementById('btn-download')?.addEventListener('click', () => {
  const header = 'Header,,,\n'
  const body = ROWS.map((row) => `${row[0]},${row[1]},${row[2]},${row[3]}`).join('\n')
  const blob = new Blob([header + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'account-activity-2026-11-08.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
})

// Landing opens at the sign-on hash so the engine sees a login URL.
setHash('#auth/signon')
