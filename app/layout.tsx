import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '题库清洗手术台',
  description: '教育题库 Markdown 文档可视化拆解、清洗与结构化工具',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='zh-CN' suppressHydrationWarning>
      <body className='antialiased'>
        {children}
      </body>
    </html>
  );
}
