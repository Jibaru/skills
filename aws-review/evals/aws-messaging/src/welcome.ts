import type { SNSEvent } from "aws-lambda";
import { sendWelcomeEmail } from "./mailer";

export const handler = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    const signup = JSON.parse(record.Sns.Message) as { userId: string; email: string };
    await sendWelcomeEmail(signup.userId, signup.email);
  }
};
