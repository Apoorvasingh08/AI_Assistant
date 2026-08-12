import "./globals.css";

export const metadata = {
  title: "Support",
  description: "Customer Support AI Assistant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
