// PublicNav takes no props — it reads auth state and the Dograh health flag
// itself. The preview provider signs the visitor out, so this renders the
// signed-out marketing header.
import { PublicNav } from "@vocalonix/web";

export function SignedOut() {
  return <PublicNav />;
}
