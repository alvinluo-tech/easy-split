import { redirect } from "next/navigation";

export default function Home() {
  // Redirect homepage to the app dashboard; unauthenticated users will be redirected to sign-in from there
  redirect("/dashboard");
}
