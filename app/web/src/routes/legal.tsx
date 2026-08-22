import { Link } from "@tanstack/react-router";

import { CONTACT_EMAIL, MarketingFooter, MarketingNav } from "../components/shell";

/**
 * Facts only the operator can supply.
 *
 * `entity` and `address` are what somebody needs in order to exercise a right
 * against a real party, and `governingLaw` is what makes the Terms enforceable
 * anywhere in particular. Blank renders the document *without* those clauses
 * rather than with invented ones: a wrong registered address is worse than a
 * missing one, and inventing a jurisdiction would be worse still.
 *
 * FILL THESE IN BEFORE TAKING LIVE PAYMENTS. Stripe asks for a published terms
 * URL and a privacy URL when an account leaves test mode, and a reviewer who
 * finds no identifiable operator behind them is the usual reason that review
 * comes back.
 */
const OPERATOR = {
  entity: "",
  address: "",
  governingLaw: "",
};

const LAST_UPDATED = "23 August 2026";

/**
 * Named because a reader is entitled to know whose machines their callers' voices
 * pass through, and because a processor list is the part of a privacy policy that
 * actually goes stale. Anything added to `env.ts` that touches call audio, call
 * text or customer records belongs here on the same commit.
 */
const SUBPROCESSORS = [
  {
    name: "Hetzner Online GmbH",
    where: "Helsinki, Finland",
    what: "Servers, databases and the voice engine itself.",
  },
  {
    name: "Cloudflare, Inc.",
    where: "Global; backups in the European Union",
    what: "DNS, TLS, content delivery, and encrypted off-site database backups.",
  },
  {
    name: "Telnyx LLC",
    where: "United States",
    what: "Phone numbers and the carrier leg of every telephone call.",
  },
  {
    name: "Speech and language providers",
    where: "United States",
    what: "Turning speech into text, text into speech, and deciding what the agent says. Depending on configuration this may be Deepgram, OpenAI, Google, ElevenLabs or Cartesia.",
  },
  {
    name: "Stripe, Inc.",
    where: "United States",
    what: "Payments and subscriptions. Card details go to Stripe directly and Harkbell never sees or stores them.",
  },
  {
    name: "Resend, Inc.",
    where: "United States",
    what: "Sign-in links, invitations and account email.",
  },
];

function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="landing-page">
      <MarketingNav />
      <section className="legal-head">
        <h1>{title}</h1>
        <p>{intro}</p>
        <p className="legal-updated">Last updated {LAST_UPDATED}</p>
      </section>
      <div className="legal-prose">{children}</div>
      <MarketingFooter />
    </div>
  );
}

/** Rendered only once the operator block above is filled in. */
function OperatorIdentity() {
  if (!OPERATOR.entity && !OPERATOR.address) return null;
  return (
    <p>
      Harkbell is operated by {OPERATOR.entity || "Harkbell"}
      {OPERATOR.address ? `, ${OPERATOR.address}` : ""}.
    </p>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The agreement between you and Harkbell. Written to be read — if something here is unclear, ask us before you agree to it."
    >
      <h2>1. Who these terms are between</h2>
      <OperatorIdentity />
      <p>
        These terms are between you and Harkbell. By creating an account, or by
        using Harkbell on behalf of a business, you agree to them. If you are
        agreeing on behalf of a business, you confirm you are allowed to.
      </p>

      <h2>2. What Harkbell does</h2>
      <p>
        Harkbell answers calls for your business — on your website and, on a paid
        plan, on a phone number connected to your account. It answers using the
        information you give it: your services, prices, opening hours and
        knowledge. It can take bookings, record callback requests and hand a
        caller to a person.
      </p>
      <p>
        What the agent says comes from what you configure. We do not review it,
        and we do not warrant that it is correct.
      </p>

      <h2>3. Your account</h2>
      <p>
        Keep your password to yourself and tell us promptly if you think somebody
        else has it. You are responsible for what happens under your account,
        including anything done by people you invite to your workspace.
      </p>
      <p>You must be at least 18 and use Harkbell for a business, not personally.</p>

      <h2>4. What you are responsible for</h2>
      <ul>
        <li>
          <strong>Telling callers they are speaking to an AI, and that the call
          is recorded.</strong> Recording and transcription law differs by
          country and by state — several require every party to consent. You
          decide what your agent discloses, so this is your obligation, not ours,
          and you should take your own advice on it.
        </li>
        <li>
          <strong>The accuracy of what you configure.</strong> Prices, hours,
          services and knowledge are yours. If the agent quotes an old price, it
          is quoting the one it was given.
        </li>
        <li>
          <strong>Complying with the law when you call people.</strong> Outbound
          callbacks are made from your number, at your instruction. Telemarketing
          and auto-dialling rules — including the TCPA in the United States and
          equivalents elsewhere — apply to you.
        </li>
        <li>
          <strong>Having the right to the material you upload</strong> as
          knowledge, and to the contact details you import.
        </li>
      </ul>

      <h2>5. Harkbell is not for emergencies</h2>
      <p>
        <strong>
          Harkbell cannot call emergency services and must never be relied on to
          reach them.
        </strong>{" "}
        It is not a telephone service, it does not support 911, 999, 112 or any
        equivalent, and it does not transmit a location. Do not present it to
        your callers as a way to get help in an emergency, and keep a way for
        them to reach a person.
      </p>

      <h2>6. The agent is software, and it can be wrong</h2>
      <p>
        Harkbell uses speech recognition and large language models. It will
        sometimes mishear, misunderstand, or answer a question badly. It can
        take a booking at a time you did not intend or record a number
        incorrectly.
      </p>
      <p>
        Check what it produces. Bookings, quotes and commitments a caller hears
        are between you and that caller — they do not bind us, and we are not a
        party to them.
      </p>

      <h2>7. Plans, minutes and payment</h2>
      <ul>
        <li>
          Plans and their allowances are listed on the{" "}
          <Link to="/pricing">pricing page</Link>. A plan is bought once per
          account and can cover more than one business.
        </li>
        <li>
          A minute is time the agent spends talking to somebody. Configuring the
          agent, testing it yourself and using the dashboard cost nothing.
        </li>
        <li>
          <strong>
            When the included minutes are spent, the agent stops answering
          </strong>{" "}
          until the period rolls over or you move up a plan. We email you when
          you are close and again when it happens. We never bill you for going
          over — there is no overage charge, because there is no overage.
        </li>
        <li>
          Subscriptions renew monthly until cancelled. Cancel any time from the
          billing portal; you keep what you have paid for until the end of that
          period, and we do not refund part-months.
        </li>
        <li>
          Prices are in US dollars and exclude any tax we are required to add. We
          may change prices with at least 30 days' notice by email, effective at
          your next renewal.
        </li>
      </ul>

      <h2>8. Phone numbers</h2>
      <p>
        On a paid plan we obtain a number from our carrier and point it at your
        agent. The number is provisioned for your use; it is not sold to you, and
        unless we agree otherwise in writing it cannot be ported away.
      </p>
      <p>
        If your account closes we may release the number back to the carrier,
        after which it is gone and cannot be recovered. Tell us before you cancel
        if the number matters to you.
      </p>

      <h2>9. Your data stays yours</h2>
      <p>
        Your configuration, your knowledge, your call records and your contacts
        belong to you. You grant us only the permission we need to run the
        service for you: to store that material, send it to the providers listed
        in our <Link to="/privacy">Privacy Policy</Link>, and show it back to you.
      </p>
      <p>
        We use aggregated, de-identified information about how the service
        performs to improve it. We do not sell your data, and we do not use your
        call content to train models of our own.
      </p>

      <h2>10. What you may not do</h2>
      <ul>
        <li>Use Harkbell for anything unlawful, deceptive or harassing.</li>
        <li>
          Impersonate somebody else, or configure an agent to deny that it is an
          AI when a caller asks.
        </li>
        <li>Run unsolicited bulk or automated outbound campaigns.</li>
        <li>
          Attempt to break, overload, reverse-engineer or gain unauthorised
          access to the service.
        </li>
        <li>Resell Harkbell without our written agreement.</li>
      </ul>

      <h2>11. Suspension and closing an account</h2>
      <p>
        You can close your account at any time. We may suspend or close an
        account that breaches these terms, that has not paid, or that is causing
        harm or risk to other customers, to our carriers or to us. Where it is
        reasonable to do so we will warn you first.
      </p>
      <p>
        After closure we delete your data on the schedule in the{" "}
        <Link to="/privacy">Privacy Policy</Link>. Export anything you want to
        keep before you close.
      </p>

      <h2>12. Availability</h2>
      <p>
        We work to keep Harkbell running and we do not promise it will never be
        down. We depend on carriers, speech providers and hosting we do not
        control. There is no uptime guarantee on these terms, and maintenance,
        provider failures and outages will happen.
      </p>

      <h2>13. Warranties and liability</h2>
      <p>
        Harkbell is provided as it is. To the fullest extent the law allows we
        exclude implied warranties, including fitness for a particular purpose
        and that the service will be uninterrupted or error-free.
      </p>
      <p>
        To the fullest extent the law allows, neither party is liable for
        indirect or consequential loss, or for lost profits, lost revenue or lost
        business — including business you believe you lost because the agent
        answered badly, or did not answer at all. Our total liability for any
        claim is limited to what you paid us in the twelve months before it
        arose.
      </p>
      <p>
        Nothing here limits liability that cannot be limited by law, including
        for death or personal injury caused by negligence, or for fraud.
      </p>

      <h2>14. Changes</h2>
      <p>
        We may update these terms. If a change materially affects you we will
        email you at least 30 days beforehand. Continuing to use Harkbell after a
        change takes effect means you accept it; if you would rather not, cancel
        before then.
      </p>

      {OPERATOR.governingLaw ? (
        <>
          <h2>15. Governing law</h2>
          <p>
            These terms are governed by the law of {OPERATOR.governingLaw}, and
            its courts have exclusive jurisdiction over any dispute.
          </p>
        </>
      ) : null}

      <h2>{OPERATOR.governingLaw ? "16." : "15."} Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What Harkbell collects, why, who else sees it, and how to get it back or get rid of it."
    >
      <h2>1. Who we are</h2>
      <OperatorIdentity />
      <p>
        Harkbell provides an AI receptionist to businesses. This policy covers
        harkbell.com, the dashboard, the website widget and calls answered on a
        connected phone number.
      </p>
      <p>
        For your own account details we are the controller. For your callers'
        details, <strong>you</strong> are the controller and we act on your
        instructions as a processor — section 4 explains what that means for you.
      </p>

      <h2>2. What we collect</h2>
      <h3>What you give us</h3>
      <ul>
        <li>Your name, email address and a hashed password.</li>
        <li>
          Your business: name, location, industry, opening hours, services,
          prices, and the knowledge you upload or write.
        </li>
        <li>Team members you invite, and their role.</li>
        <li>
          Billing details. Card numbers go to Stripe directly — we hold only a
          customer reference, the plan and its status.
        </li>
      </ul>
      <h3>What calls produce</h3>
      <ul>
        <li>Audio of calls answered by your agent, and transcripts of them.</li>
        <li>
          Whatever a caller tells the agent: their name, phone number, email
          address, what they wanted, and anything else they choose to say.
        </li>
        <li>
          Bookings, callback requests, contacts and the questions your agent
          could not answer.
        </li>
        <li>Call time, duration, outcome and which number was involved.</li>
      </ul>
      <h3>What we record automatically</h3>
      <ul>
        <li>
          A session cookie so you stay signed in. It is strictly necessary, and
          we set no advertising or analytics cookies.
        </li>
        <li>
          Server logs: IP address, browser, and which requests were made. Used
          for security and debugging.
        </li>
      </ul>

      <h2>3. Why we use it</h2>
      <ul>
        <li>To run the service you asked for — this is the bulk of it.</li>
        <li>To bill you, and to meet our tax and accounting obligations.</li>
        <li>
          To keep the service secure, investigate abuse and enforce our{" "}
          <Link to="/terms">Terms</Link>.
        </li>
        <li>
          To email you about your account: sign-in links, invitations, and
          notices such as your minutes running out. These are not marketing and
          you cannot unsubscribe from them while you have an account.
        </li>
      </ul>
      <p>
        Where the GDPR applies, our bases are performance of a contract, our
        legitimate interest in a secure and working service, and legal
        obligation.
      </p>

      <h2>4. Calls, recordings and consent</h2>
      <p>
        Calls answered by your agent are recorded and transcribed. That is how
        the product shows you what was said and extracts bookings and contacts
        from it.
      </p>
      <p>
        <strong>
          Telling your callers is your responsibility, not ours.
        </strong>{" "}
        You decide what your agent says when it answers. Recording and
        transcription law varies — some places require every party to consent
        before a call may be recorded. You control the disclosure, so you carry
        the obligation, and you should take your own advice on what your agent
        needs to say.
      </p>
      <p>
        If one of your callers contacts us directly about their data, we will
        point them to you and tell you about it, because it is your record and
        not ours to change.
      </p>

      <h2>5. Who else sees it</h2>
      <p>
        We use the providers below to run Harkbell. Each gets only what it needs
        for its part, each is bound by a contract, and none of them may use your
        data for their own purposes.
      </p>
      <ul className="legal-list">
        {SUBPROCESSORS.map((processor) => (
          <li key={processor.name}>
            <strong>{processor.name}</strong> <em>({processor.where})</em> —{" "}
            {processor.what}
          </li>
        ))}
      </ul>
      <p>
        We may also disclose data where the law requires it, or to a buyer if the
        business is sold — in which case we will tell you first.
      </p>
      <p>
        <strong>We do not sell your data,</strong> we do not share it for
        advertising, and we do not use your calls to train AI models.
      </p>

      <h2>6. Where it is held</h2>
      <p>
        Your database, your recordings and your transcripts live on servers in
        Helsinki, Finland. Encrypted backups are stored in the European Union.
      </p>
      <p>
        Some of the providers above are in the United States, so call audio and
        text are processed there in the course of a call. Those transfers rely on
        the European Commission's Standard Contractual Clauses.
      </p>

      <h2>7. How long we keep it</h2>
      <ul>
        <li>
          <strong>Account and business data</strong> — while your account is
          open, then deleted within 30 days of closure.
        </li>
        <li>
          <strong>Call recordings and transcripts</strong> — until you delete
          them, or until your account closes.
        </li>
        <li>
          <strong>Backups</strong> — rolling, and never more than 14 days old, so
          deleted data leaves the backups within 14 days too.
        </li>
        <li>
          <strong>Billing records</strong> — kept as long as tax law requires,
          normally six years.
        </li>
        <li>
          <strong>Server logs</strong> — a short rolling window for security.
        </li>
      </ul>

      <h2>8. Your rights</h2>
      <p>
        Depending on where you live you may have the right to see the data we
        hold about you, correct it, delete it, take a copy elsewhere, object to a
        use of it, or ask us to restrict it. Most of this you can do yourself in
        the dashboard; for the rest, email us and we will answer within 30 days.
      </p>
      <p>
        In the EU or UK you may complain to your data protection authority. In
        California you have equivalent rights under the CCPA, and we do not sell
        or share personal information as that law defines it.
      </p>

      <h2>9. Security</h2>
      <p>
        Traffic is encrypted in transit. Passwords are hashed, never stored.
        Access to production is restricted to the people who operate it, and the
        browser is never given credentials for the voice engine. No system is
        perfectly secure; if a breach affects you we will tell you and the
        relevant regulator as the law requires.
      </p>

      <h2>10. Children</h2>
      <p>
        Harkbell is for businesses and is not directed at children. We do not
        knowingly collect data from anyone under 16. If you believe a child's
        data has reached us, tell us and we will delete it.
      </p>

      <h2>11. Changes</h2>
      <p>
        We will update this policy as the service changes, and the date at the
        top will change with it. If a change materially affects you we will email
        you before it takes effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        Any question about your data, or to exercise a right:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
