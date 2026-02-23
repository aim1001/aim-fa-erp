import { listFolderFiles, downloadFile } from "./server/onedrive";
import * as XLSX from "xlsx";

async function main() {
  const folderId = "4D5DB16034CEA!s3960d8dd611246e2b57e804f108e9d93";
  const files = await listFolderFiles(folderId);
  
  const ef = files.find(f => f.name === '26-1_엠티에스이_UNI.xlsx');
  if (!ef) { console.log("Not found"); return; }
  
  const buffer = await downloadFile(ef.id);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  
  // Check ALL sheets
  console.log("Sheet names:", workbook.SheetNames);
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    console.log(`\n========== Sheet: "${sheetName}" (Range: ${sheet['!ref']}) ==========`);
    
    // Print first 15 rows fully
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    for (let r = 0; r <= Math.min(14, range.e.r); r++) {
      const rowData: string[] = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[cellRef];
        if (cell && cell.v !== undefined && cell.v !== '') {
          rowData.push(`${XLSX.utils.encode_col(c)}${r+1}="${String(cell.v).substring(0, 40)}"`);
        }
      }
      if (rowData.length > 0) {
        console.log(`  Row ${r+1}: ${rowData.join(' | ')}`);
      }
    }
  }
}

main().catch(console.error);
