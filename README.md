This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Vercel 배포

1. Vercel에서 이 저장소를 Import (Framework: Next.js 자동 감지)
2. Project Settings → Environment Variables 에 `.env.example` 의 키를 등록
   - `NEXT_PUBLIC_KAKAO_MAP_KEY`, `SEOUL_OPEN_API_KEY`, `DATA_GO_KR_SERVICE_KEY`, `KAKAO_REST_API_KEY`, (선택) `ORS_API_KEY`
3. 카카오 개발자 콘솔 → 플랫폼 → Web 에 배포 도메인(`https://<프로젝트>.vercel.app`) 추가
4. `vercel.json` 으로 함수 리전을 서울(`icn1`)로 고정해 국내 공공 API 응답 속도를 확보했습니다.
