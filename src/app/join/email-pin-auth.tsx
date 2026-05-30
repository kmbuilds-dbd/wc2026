"use client";

import { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

type AuthFlow = "sign-in" | "sign-up";
type AuthStep = "email" | "code";
type MissingSignUpField = "first_name" | "last_name" | "password" | "legal_accepted" | string;

type EmailCodeFactorLike = {
  strategy: string;
  emailAddressId: string;
};

function findEmailCodeFactor(factors: unknown): EmailCodeFactorLike | null {
  if (!Array.isArray(factors)) return null;

  return (
    factors.find(
      (factor): factor is EmailCodeFactorLike =>
        typeof factor === "object" &&
        factor !== null &&
        "strategy" in factor &&
        "emailAddressId" in factor &&
        factor.strategy === "email_code" &&
        typeof factor.emailAddressId === "string",
    ) ?? null
  );
}

function shouldStartSignUp(error: unknown) {
  if (!isClerkAPIResponseError(error)) return false;

  return error.errors.some((item) =>
    [
      "form_identifier_not_found",
      "identifier_not_found",
      "resource_not_found",
    ].includes(item.code),
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isClerkAPIResponseError(error)) {
    return (
      error.errors[0]?.longMessage ??
      error.errors[0]?.message ??
      fallback
    );
  }

  if (error instanceof Error) return error.message;
  return fallback;
}

function describeMissingFields(fields: MissingSignUpField[] | undefined) {
  if (!fields?.length) return "Clerk did not return which requirement is missing.";

  const labels = fields.map((field) => {
    if (field === "first_name") return "first name";
    if (field === "last_name") return "last name";
    if (field === "legal_accepted") return "legal acceptance";
    if (field === "password") return "password";
    return field.replaceAll("_", " ");
  });

  return `Missing requirement${labels.length === 1 ? "" : "s"}: ${labels.join(", ")}.`;
}

export function EmailPinAuth({
  inviteCode,
  invitePresent,
}: {
  inviteCode?: string;
  invitePresent: boolean;
}) {
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<AuthStep>("email");
  const [flow, setFlow] = useState<AuthFlow>("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clerkReady = signInLoaded && signUpLoaded;
  const normalizedEmail = email.trim().toLowerCase();
  const hasValidInvite = Boolean(inviteCode);
  const joinUrl = inviteCode ? `/join?code=${encodeURIComponent(inviteCode)}` : "/join";

  async function startSignUp() {
    if (!signUp) return;
    if (!hasValidInvite) {
      setError(
        invitePresent
          ? "That invite link is not valid. Ask the group admin for a fresh invite."
          : "Use your invite link to join. Existing users can sign in here.",
      );
      return;
    }

    await signUp.create({ emailAddress: normalizedEmail });
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    setFlow("sign-up");
    setStep("code");
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!normalizedEmail) {
      setError("Enter an email address.");
      return;
    }

    if (!clerkReady || !signIn || !signUp) {
      setError("Auth is still loading. Try again in a moment.");
      return;
    }

    setBusy(true);
    try {
      const signInAttempt = await signIn.create({ identifier: normalizedEmail });
      const factor = findEmailCodeFactor(signInAttempt.supportedFirstFactors);

      if (!factor) {
        setError("Email PIN sign-in is not enabled for this address.");
        return;
      }

      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: factor.emailAddressId,
      });
      setFlow("sign-in");
      setStep("code");
    } catch (err) {
      if (shouldStartSignUp(err)) {
        if (!hasValidInvite) {
          setError(
            invitePresent
              ? "That invite link is not valid. Existing users can sign in, but new users need a valid invite."
              : "No account found. Use your invite link to join this group.",
          );
        } else {
          try {
            await startSignUp();
          } catch (signUpErr) {
            setError(
              getErrorMessage(
                signUpErr,
                "Could not send a verification code to that email.",
              ),
            );
          }
        }
      } else {
        setError(
          getErrorMessage(err, "Could not send a verification code to that email."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Enter the PIN.");
      return;
    }

    if (!clerkReady || !signIn || !signUp || !setActiveSignIn || !setActiveSignUp) {
      setError("Auth is still loading. Try again in a moment.");
      return;
    }

    setBusy(true);
    try {
      if (flow === "sign-in") {
        const result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: trimmedCode,
        });

        if (result.status !== "complete" || !result.createdSessionId) {
          setError("This account needs an extra verification step.");
          return;
        }

        await setActiveSignIn({ session: result.createdSessionId });
      } else {
        const result = await signUp.attemptEmailAddressVerification({
          code: trimmedCode,
        });

        if (
          result.status === "missing_requirements" &&
          result.missingFields.length === 1 &&
          result.missingFields[0] === "legal_accepted"
        ) {
          const updated = await signUp.update({ legalAccepted: true });
          if (updated.status === "complete" && updated.createdSessionId) {
            await setActiveSignUp({ session: updated.createdSessionId });
            window.location.assign(joinUrl);
            return;
          }
          setError(
            `Sign-up still needs more information. ${describeMissingFields(
              updated.missingFields,
            )}`,
          );
          return;
        }

        if (result.status !== "complete" || !result.createdSessionId) {
          setError(
            `Sign-up is not complete yet (${result.status}). ${describeMissingFields(
              result.missingFields,
            )}`,
          );
          return;
        }

        await setActiveSignUp({ session: result.createdSessionId });
      }

      window.location.assign(joinUrl);
    } catch (err) {
      setError(getErrorMessage(err, "That PIN did not verify."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border-base rounded p-6 w-full bg-surface">
      <div className="mb-4 text-xs text-text-muted leading-relaxed">
        Existing users can sign in with an email PIN.
        {hasValidInvite
          ? " New users can join with this invite link."
          : " New users need a valid invite link to join."}
      </div>
      {step === "email" ? (
        <form className="space-y-4" onSubmit={handleEmailSubmit}>
          <label className="block space-y-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              Email
            </span>
            <input
              autoComplete="email"
              className="w-full rounded-sm border border-border-base bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent disabled:opacity-60"
              disabled={busy}
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </label>
          <button
            className="w-full rounded-sm border border-accent/40 bg-accent px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-bg transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy || !clerkReady}
            type="submit"
          >
            {busy ? "Sending" : "Continue"}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleCodeSubmit}>
          <label className="block space-y-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              PIN
            </span>
            <input
              autoComplete="one-time-code"
              className="w-full rounded-sm border border-border-base bg-bg px-3 py-2 text-center font-mono text-lg tracking-[0.18em] text-text outline-none focus:border-accent disabled:opacity-60"
              disabled={busy}
              inputMode="numeric"
              maxLength={8}
              name="code"
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </label>
          <div className="flex gap-3">
            <button
              className="flex-1 rounded-sm border border-accent/40 bg-accent px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-bg transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !clerkReady}
              type="submit"
            >
              {busy ? "Checking" : "Verify"}
            </button>
            <button
              className="rounded-sm border border-border-base px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={() => {
                setCode("");
                setStep("email");
                setError(null);
              }}
              type="button"
            >
              Back
            </button>
          </div>
        </form>
      )}
      {error ? (
        <p className="mt-4 rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div id="clerk-captcha" />
    </div>
  );
}
