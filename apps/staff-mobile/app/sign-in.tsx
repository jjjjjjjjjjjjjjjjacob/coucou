import { isClerkAPIResponseError, useAuth, useSignIn } from "@clerk/expo";
import { Redirect } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionButton } from "@/components/action-button";
import { ThresholdMark } from "@/components/threshold-mark";
import { colors, radii, spacing, typography } from "@/theme";

type VerificationStrategy = "email_code" | "phone_code";
type VerificationStage = "identifier" | "first_factor" | "second_factor";

function resolveErrorMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    return (
      error.errors[0]?.longMessage ?? error.errors[0]?.message ?? "We could not complete sign-in."
    );
  }
  return error instanceof Error ? error.message : "We could not complete sign-in.";
}

export default function SignInScreen(): React.JSX.Element {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const [identifier, setIdentifier] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationStage, setVerificationStage] = useState<VerificationStage>("identifier");
  const [verificationStrategy, setVerificationStrategy] =
    useState<VerificationStrategy>("email_code");
  const [safeIdentifier, setSafeIdentifier] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isSignedIn) {
    return <Redirect href="/(tabs)/scan" />;
  }

  const prepareVerification = async (): Promise<void> => {
    if (!isLoaded || !signIn || !identifier.trim()) {
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const createResult = await signIn.create({
        identifier: identifier.trim(),
      });
      if (createResult.error) {
        throw createResult.error;
      }
      const codeFactor = signIn.supportedFirstFactors.find(
        (factor) => factor.strategy === "email_code" || factor.strategy === "phone_code",
      );
      if (!codeFactor) {
        throw new Error("This account does not have email or phone verification enabled.");
      }

      if (codeFactor.strategy === "email_code") {
        const sendResult = await signIn.emailCode.sendCode({
          emailAddressId: codeFactor.emailAddressId,
        });
        if (sendResult.error) {
          throw sendResult.error;
        }
      } else {
        const sendResult = await signIn.phoneCode.sendCode({
          phoneNumberId: codeFactor.phoneNumberId,
        });
        if (sendResult.error) {
          throw sendResult.error;
        }
      }
      setVerificationStrategy(codeFactor.strategy);
      setSafeIdentifier(codeFactor.safeIdentifier);
      setVerificationStage("first_factor");
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const prepareSecondFactor = async (): Promise<void> => {
    const secondFactor = signIn.supportedSecondFactors?.find(
      (factor) => factor.strategy === "phone_code",
    );
    if (!secondFactor) {
      throw new Error(
        "This account requires an authenticator or backup code. Use the web sign-in once to update its verification settings.",
      );
    }
    const sendResult = await signIn.mfa.sendPhoneCode();
    if (sendResult.error) {
      throw sendResult.error;
    }
    setVerificationStrategy("phone_code");
    setSafeIdentifier(secondFactor.safeIdentifier);
    setVerificationCode("");
    setVerificationStage("second_factor");
  };

  const attemptVerification = async (): Promise<void> => {
    if (!isLoaded || !signIn || !verificationCode.trim()) {
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const verificationResult =
        verificationStage === "second_factor"
          ? await signIn.mfa.verifyPhoneCode({
              code: verificationCode.trim(),
            })
          : verificationStrategy === "email_code"
            ? await signIn.emailCode.verifyCode({
                code: verificationCode.trim(),
              })
            : await signIn.phoneCode.verifyCode({
                code: verificationCode.trim(),
              });
      if (verificationResult.error) {
        throw verificationResult.error;
      }

      if (signIn.status === "complete") {
        const finalizeResult = await signIn.finalize();
        if (finalizeResult.error) {
          throw finalizeResult.error;
        }
      } else if (signIn.status === "needs_second_factor") {
        await prepareSecondFactor();
      } else {
        throw new Error("Additional account verification is required.");
      }
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEnteringCode = verificationStage !== "identifier";
  const inputAccessibilityLabel = isEnteringCode
    ? `Verification code sent to ${safeIdentifier}`
    : "Email address or phone number";

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.brand}>
          <ThresholdMark height={64} />
          <View>
            <Text style={styles.brandName}>COUCOU</Text>
            <Text style={styles.brandDescriptor}>STAFF ENTRY</Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>{isEnteringCode ? "Enter your code" : "Ready the door"}</Text>
          <Text style={styles.subtitle}>
            {isEnteringCode
              ? `We sent a verification code to ${safeIdentifier}.`
              : "Sign in with your existing staff account. Mobile sign-up is disabled."}
          </Text>

          <TextInput
            accessibilityLabel={inputAccessibilityLabel}
            autoCapitalize="none"
            autoComplete={isEnteringCode ? "one-time-code" : "email"}
            autoCorrect={false}
            editable={!isSubmitting}
            inputMode={isEnteringCode ? "numeric" : identifier.includes("@") ? "email" : "text"}
            keyboardType={isEnteringCode ? "number-pad" : "email-address"}
            onChangeText={isEnteringCode ? setVerificationCode : setIdentifier}
            onSubmitEditing={() => {
              void (isEnteringCode ? attemptVerification() : prepareVerification());
            }}
            placeholder={isEnteringCode ? "000000" : "name@example.com or +1…"}
            placeholderTextColor={colors.steel}
            returnKeyType="done"
            style={[styles.input, isEnteringCode && styles.codeInput]}
            textContentType={isEnteringCode ? "oneTimeCode" : "username"}
            value={isEnteringCode ? verificationCode : identifier}
          />

          {errorMessage ? (
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}

          <ActionButton
            disabled={isEnteringCode ? verificationCode.trim().length < 4 : !identifier.trim()}
            isLoading={isSubmitting}
            label={isEnteringCode ? "Verify and continue" : "Send code"}
            onPress={() => {
              void (isEnteringCode ? attemptVerification() : prepareVerification());
            }}
          />
          {isEnteringCode ? (
            <ActionButton
              label="Use a different account"
              onPress={() => {
                setVerificationStage("identifier");
                setVerificationCode("");
                setErrorMessage("");
              }}
              variant="quiet"
            />
          ) : null}
        </View>

        <Text style={styles.footer}>Access is limited to invited Door, Host, and Admin staff.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.night,
  },
  keyboardView: {
    flex: 1,
    justifyContent: "space-between",
    padding: spacing.extraLarge,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.medium,
    paddingTop: spacing.large,
  },
  brandName: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 24,
    letterSpacing: 3.5,
  },
  brandDescriptor: {
    color: colors.admit,
    fontFamily: typography.mono,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  form: {
    gap: spacing.large,
  },
  title: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 34,
    lineHeight: 40,
  },
  subtitle: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  input: {
    minHeight: 56,
    borderColor: colors.rule,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    backgroundColor: colors.booth,
    color: colors.paper,
    fontFamily: typography.regular,
    fontSize: 17,
    paddingHorizontal: spacing.large,
  },
  codeInput: {
    fontFamily: typography.mono,
    fontSize: 26,
    letterSpacing: 8,
    textAlign: "center",
  },
  error: {
    color: colors.failure,
    fontFamily: typography.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 12,
    lineHeight: 18,
  },
});
