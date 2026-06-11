import { spawn } from "node:child_process";

const fallbackFonts = [
  "Arial",
  "Calibri",
  "Cambria",
  "Candara",
  "Consolas",
  "Georgia",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana"
];

let cachedFonts: string[] | null = null;

export async function listSystemFonts(): Promise<string[]> {
  if (cachedFonts) {
    return cachedFonts;
  }

  const fonts = process.platform === "win32" ? await listWindowsFonts().catch(() => []) : [];
  cachedFonts = normalizeFontList(fonts.length > 0 ? fonts : fallbackFonts);
  return cachedFonts;
}

function listWindowsFonts() {
  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $paths = @(
      'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
      'Registry::HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
    )
    $fonts = @()
    foreach ($path in $paths) {
      if (Test-Path $path) {
        $fonts += (Get-ItemProperty $path).PSObject.Properties |
          Where-Object { $_.MemberType -eq 'NoteProperty' } |
          ForEach-Object { $_.Name }
      }
    }
    $fonts | Sort-Object -Unique | ConvertTo-Json -Compress
  `;

  return new Promise<string[]>((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Font lookup exited with code ${code}.`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim() || "[]") as string[] | string;
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeFontList(fonts: string[]) {
  return [...new Set(fonts.map(normalizeFontName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeFontName(name: string) {
  return name
    .replace(/\s*\((?:TrueType|OpenType|Type 1)\)\s*$/i, "")
    .replace(/\s+(?:Bold|Italic|Regular|Oblique|Light|Medium|Semibold|SemiBold|Black)\s*$/i, "")
    .trim();
}
