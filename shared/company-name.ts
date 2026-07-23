// 상호 정규화: 법인격 표기((주)·㈜·주식회사·(유) 등)와 공백 차이를 무시하고
// 같은 거래처로 매칭하기 위한 키를 만든다.
// 예) "(주)두드림", "주식회사 두드림", "두드림(주)" → 모두 "두드림"

const CORP_TOKENS = [
  "주식회사",
  "유한회사",
  "유한책임회사",
  "합자회사",
  "합명회사",
  "재단법인",
  "사단법인",
  "사회적협동조합",
  "협동조합",
];

export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";
  let s = String(name);
  // 괄호형 법인격 표기 제거: (주) （주） (유) (재) (사) (유한) (주식회사) 등
  s = s.replace(/[（(]\s*(주식회사|주|유|재|사|유한)\s*[）)]/g, "");
  // 기호형 법인격 표기 제거: ㈜
  s = s.replace(/㈜/g, "");
  // 단어형 법인격 표기 제거
  for (const t of CORP_TOKENS) s = s.split(t).join("");
  // 공백·대소문자 차이 무시
  return s.replace(/\s+/g, "").toLowerCase().trim();
}
