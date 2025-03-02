import { openai } from "lib/ai/openai"
import { getPrimarySourceCodeFromVfs } from "lib/utils/get-primary-source-code-from-vfs"

interface AttemptHistory {
  code: string
  error: string
}

export const askAiWithPreviousAttempts = async (
  options: {
    prompt: string
    systemPrompt: string
    previousAttempts?: AttemptHistory[]
    onStream?: (chunk: string) => void
  },
  context: {
    vfs?: Record<string, string>
    openaiClient?: typeof openai
  },
): Promise<string> => {
  let { vfs, openaiClient } = context
  const { prompt, systemPrompt, previousAttempts, onStream } = options
  const client = openaiClient || openai
  const messages: { role: "assistant" | "user" | "system"; content: string }[] =
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ]

  const primarySourceCode = getPrimarySourceCodeFromVfs(vfs)

  if (primarySourceCode) {
    messages.push({
      role: "assistant",
      content: "Please modify the code provided by the user.",
    })
    messages.push({
      role: "user",
      content: primarySourceCode,
    })
  }

  if (previousAttempts?.length) {
    messages.push({
      role: "user",
      content: "Previous attempts failed. Here are the details:",
    })

    previousAttempts.forEach((attempt, index) => {
      messages.push(
        { role: "assistant", content: attempt.code },
        {
          role: "user",
          content: `Attempt ${index + 1} error: ${attempt.error}`,
        },
      )
    })

    messages.push({
      role: "user",
      content:
        "Please provide a new solution that addresses these errors. Avoid approaches that led to previous failures.",
    })
  }

  let result = ""

  try {
    if (onStream)
      onStream(
        `Start streaming AI response, attempt: ${(previousAttempts?.length || 0) + 1}`,
      )
    const completionStream = await client.chat.completions.create({
      model: "gpt-4o-mini",

      max_tokens: 2048,

      messages: messages,
      stream: true,
    })
    for await (const chunk of completionStream) {
      const textChunk = chunk.choices[0].delta.content

      if (onStream) onStream(textChunk || "")
      result += textChunk
    }
  } catch (e) {
    result = "Error in AI API request"
  }

  return result
}
