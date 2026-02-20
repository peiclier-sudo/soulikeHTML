// Redirect to root — the actual game scene lives at /game
import { redirect } from 'next/navigation';
export default function GameGroupIndex() {
  redirect('/');
}
