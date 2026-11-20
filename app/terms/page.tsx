import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms · Trove" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="November 20, 2026">
      <p>By using Trove you agree to these terms. They&rsquo;re short; please read them.</p>

      <h2>Using Trove</h2>
      <ul>
        <li>Trove is free for personal use. You need to be at least 18.</li>
        <li>Keep your sign-in codes to yourself; you&rsquo;re responsible for what happens in your account.</li>
        <li>
          Be decent: don&rsquo;t post anything unlawful, hateful or harassing, don&rsquo;t pretend to be someone else, and
          don&rsquo;t try to break, overload or misuse Trove.
        </li>
      </ul>

      <h2>Your things</h2>
      <p>
        What you save and write stays yours. You let Trove store it and show it to the people you choose (your friends,
        and anyone you send a link), so the app can work. You can delete it, or your whole account, at any time.
      </p>

      <h2>Sign-in text messages</h2>
      <ul>
        <li>
          <strong>Trove sign-in codes:</strong> when you enter your phone number and tap &ldquo;Send me a code&rdquo;,
          you agree to receive a text message with a one-time sign-in code.
        </li>
        <li>One message each time you ask for a code; nothing else is sent. Message and data rates may apply.</li>
        <li>
          Reply <strong>STOP</strong> to stop receiving texts, or <strong>HELP</strong> for help. You can still sign in
          with email.
        </li>
        <li>Carriers aren&rsquo;t liable for delayed or undelivered messages.</li>
        <li>
          See our <Link href="/privacy">privacy policy</Link> for how your number is handled. We never share it for marketing.
        </li>
      </ul>

      <h2>Recommendations and ideas</h2>
      <p>
        Ideas and details in Trove come from friends, catalogs, maps and AI, and can be wrong or out of date: check
        opening hours, prices and the like before you go.
      </p>

      <h2>No guarantees</h2>
      <p>
        Trove is provided as it is, without warranties. We do our best to keep it running and your things safe, but we
        can&rsquo;t promise it will always be available or free of mistakes, and to the extent the law allows we
        aren&rsquo;t liable for losses from using it. We may change or end features, and we may suspend accounts that
        break these terms.
      </p>

      <h2>Changes and questions</h2>
      <p>
        If these terms change, we&rsquo;ll update this page and the date above; using Trove after that means you accept
        them. For questions, <Contact />.
      </p>
    </LegalPage>
  );
}
