// Bare root route "/" — the app has no real landing page, it just forwards
// straight to the Dashboard.
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
