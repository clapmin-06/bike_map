import { connection } from "next/server";
import { isConfigured, SERVER_KEYS, type ServerKeyName } from "@/lib/server/env";

// 키가 설정되었는지(true/false)만 알려줍니다. 키 값은 절대 반환하지 않습니다.
export async function GET() {
  await connection(); // 빌드 시점이 아니라 요청 시점의 환경변수를 반영
  const keys = Object.fromEntries(
    (Object.keys(SERVER_KEYS) as ServerKeyName[]).map((k) => [SERVER_KEYS[k], isConfigured(k)]),
  );
  return Response.json({ ok: true, keys }, { headers: { "Cache-Control": "no-store" } });
}
