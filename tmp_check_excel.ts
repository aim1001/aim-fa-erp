import { listFolderFiles, downloadFile } from "./server/onedrive";
import * as XLSX from "xlsx";

async function main() {
  const folderId = "4D5DB16034CEA!s3960d8dd611246e2b57e804f108e9d93";
  const files = await listFolderFiles(folderId);
  console.log("=== Files in 26-1_엠티에스이 folder ===");
  for (const f of files) {
    console.log(`  ${f.name} (${f.mimeType}, ${f.size} bytes)`);
  }
  
  const excelFiles = files.filter(f => 
    f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.xlsm')
  );
  
  if (excelFiles.length === 0) {
    console.log("No Excel files found!");
    return;
  }
  
  for (const ef of excelFiles) {
    console.log(`\n=== Parsing: ${ef.name} ===`);
    const buffer = await downloadFile(ef.id);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      console.log(`\nSheet: "${sheetName}" (Range: ${sheet['!ref']})`);
      
      // Print rows 1-15 for columns V to AB (indices 21-27)
      console.log("\n--- Columns V(21) to AB(27), Rows 1-15 ---");
      for (let r = 0; r <= 14; r++) {
        const rowData: string[] = [];
        for (let c = 21; c <= 27; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[cellRef];
          const val = cell ? String(cell.v || '').substring(0, 30) : '';
          rowData.push(`${XLSX.utils.encode_col(c)}${r+1}=${val}`);
        }
        if (rowData.some(d => !d.endsWith('='))) {
          console.log(`  Row ${r+1}: ${rowData.join(' | ')}`);
        }
      }
      
      // Find cells with customer-related Korean text
      console.log("\n--- Customer-related cells ---");
      const allKeys = Object.keys(sheet).filter(k => !k.startsWith('!'));
      for (const key of allKeys) {
        const val = String(sheet[key].v || '');
        if (/회사|주소|이름|이메일|전화|담당|연락|메일|팩스|Tel|Fax|mail|상호|사업자|대표|업태|종목/.test(val)) {
          console.log(`  ${key}: "${val.substring(0, 50)}"`);
        }
      }
      
      break; // first sheet only
    }
  }
}

main().catch(console.error);
