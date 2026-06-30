// 프로젝트 계약조건에 단계별 '금액' 컬럼 추가 (비율 외 직접 금액 입력 지원).
// 안전한 가산형 마이그레이션: nullable integer + IF NOT EXISTS (데이터 손실 없음).
import { pool } from "../server/db";

async function main() {
  const cols = ["deposit_amount", "mid_amount", "final_amount"];
  for (const col of cols) {
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS ${col} integer`);
    console.log(`ok: projects.${col}`);
  }
  await pool.end();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
