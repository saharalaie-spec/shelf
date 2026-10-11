import { aiEnabled } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { listBooks } from "@/lib/shelf";
import { Login } from "@/components/Login";
import { ShelfApp } from "@/components/ShelfApp";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <Login />;
  const books = await listBooks(user.id);
  return (
    <ShelfApp
      user={{ name: user.name, contact: user.email ?? user.phone ?? "" }}
      initialBooks={books}
      features={{ photo: aiEnabled() }}
    />
  );
}
