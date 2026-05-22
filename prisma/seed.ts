import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const jobs = [
    {
      id: "frontend-engineer",
      title: "Frontend Engineer",
      description:
        "Build responsive, accessible web applications using React and TypeScript. Focus on component architecture, state management, and performance optimization.",
      maxDurationSeconds: 1200,
      questionPack: {
        behavioral: [
          {
            category: "collaboration",
            text: "Tell me about a time you had to convince a designer or product manager to change a UI decision. What happened?",
            followUpHints: ["What data did you use?", "How did the team react?"],
          },
          {
            category: "problem-solving",
            text: "Describe a production bug you debugged that was particularly challenging. What was your process?",
            followUpHints: ["What tools did you use?", "How did you prevent it from recurring?"],
          },
          {
            category: "ownership",
            text: "Tell me about a feature you built end-to-end. What trade-offs did you make?",
            followUpHints: ["What would you do differently?", "How did you measure success?"],
          },
        ],
        technical: [
          {
            category: "react-design",
            text: "How do you decide between using a single shared component versus creating separate components for similar UIs?",
            followUpHints: ["Give a concrete example.", "How does this affect bundle size?"],
          },
          {
            category: "typescript",
            text: "Walk me through how you would type a complex API response that has multiple union types.",
            followUpHints: ["How do you handle discriminated unions?", "What about runtime validation?"],
          },
          {
            category: "state-management",
            text: "When would you reach for a global state library versus React context versus local component state?",
            followUpHints: ["How does this change with server components?", "What about caching?"],
          },
          {
            category: "performance",
            text: "Describe your approach to optimizing a slow React page. What metrics do you look at first?",
            followUpHints: ["How do you measure before/after?", "What about bundle splitting?"],
          },
          {
            category: "accessibility",
            text: "How do you ensure the components you build are accessible? Walk me through your testing approach.",
            followUpHints: ["What ARIA patterns do you use most?", "How do you test with screen readers?"],
          },
        ],
      },
      systemPrompt: `You are an experienced technical interviewer for a Frontend Engineer position.

Your task: conduct a structured voice interview with 6 questions drawn from the question pack below.

Rules:
- Use the provided question pack — select questions strategically based on the candidate's previous answers
- Ask 3-4 technical questions and 2-3 behavioral questions, interleaving them naturally
- Include at least 2 follow-ups that reference the candidate's specific previous answers
- Keep spoken responses under 30 words — conversational and natural
- Ask exactly ONE question per response
- On question 6, signal it's the final question

Output must be valid JSON with this exact schema:
{
  "thought_process": "Your internal reasoning for choosing this question",
  "skills_detected": ["skill1", "skill2"],
  "spoken_response": "The question text to speak to the candidate"
}`,
    },
    {
      id: "backend-engineer",
      title: "Backend Engineer",
      description:
        "Design and implement scalable APIs, database schemas, and system architectures. Focus on reliability, performance, and clean data models.",
      maxDurationSeconds: 1200,
      questionPack: {
        behavioral: [
          {
            category: "collaboration",
            text: "Tell me about a time you had to push back on a product requirement because of technical constraints. How did you handle it?",
            followUpHints: ["What compromise did you reach?", "How did you communicate the trade-offs?"],
          },
          {
            category: "incident-response",
            text: "Describe a production incident you helped resolve. What was your role, and what did you learn?",
            followUpHints: ["How long was the outage?", "What monitoring caught it?"],
          },
          {
            category: "mentorship",
            text: "Tell me about a time you helped a junior engineer improve their code quality or system design skills.",
            followUpHints: ["What approach did you take?", "What was the outcome?"],
          },
        ],
        technical: [
          {
            category: "api-design",
            text: "How do you design a REST API for a resource that has complex relationships? Walk me through your approach to versioning and backwards compatibility.",
            followUpHints: ["How do you handle N+1 queries?", "What about pagination standards?"],
          },
          {
            category: "database-modeling",
            text: "When would you choose a relational database over a document store? Give me a concrete example from your experience.",
            followUpHints: ["How do you handle schema migrations?", "What about indexing strategy?"],
          },
          {
            category: "system-architecture",
            text: "Describe how you would design a system that needs to handle 10x traffic spikes while maintaining data consistency.",
            followUpHints: ["What would you use for message queuing?", "How do you handle idempotency?"],
          },
          {
            category: "scalability",
            text: "How do you approach breaking a monolithic service into microservices? What criteria do you use?",
            followUpHints: ["How do you handle shared data?", "What about transaction boundaries?"],
          },
          {
            category: "testing",
            text: "Describe your testing strategy for backend services. What level of test coverage do you aim for and why?",
            followUpHints: ["How do you test database interactions?", "What about integration vs unit tests?"],
          },
        ],
      },
      systemPrompt: `You are an experienced technical interviewer for a Backend Engineer position.

Your task: conduct a structured voice interview with 6 questions drawn from the question pack below.

Rules:
- Use the provided question pack — select questions strategically based on the candidate's previous answers
- Ask 3-4 technical questions and 2-3 behavioral questions, interleaving them naturally
- Include at least 2 follow-ups that reference the candidate's specific previous answers
- Keep spoken responses under 30 words — conversational and natural
- Ask exactly ONE question per response
- On question 6, signal it's the final question

Output must be valid JSON with this exact schema:
{
  "thought_process": "Your internal reasoning for choosing this question",
  "skills_detected": ["skill1", "skill2"],
  "spoken_response": "The question text to speak to the candidate"
}`,
    },
    {
      id: "product-manager",
      title: "Product Manager",
      description:
        "Drive product strategy through user research, prioritization frameworks, and cross-functional collaboration. Balance business goals with user needs.",
      maxDurationSeconds: 1200,
      questionPack: {
        behavioral: [
          {
            category: "stakeholder-management",
            text: "Tell me about a time you had to manage conflicting priorities from two different stakeholders. How did you resolve it?",
            followUpHints: ["What framework did you use?", "What was the final decision?"],
          },
          {
            category: "failure",
            text: "Describe a product decision you made that didn't work out. What did you learn and how did you apply that lesson?",
            followUpHints: ["What data were you missing?", "How did you communicate the failure?"],
          },
          {
            category: "user-advocacy",
            text: "Tell me about a time you championed a user need that the business hadn't prioritized. How did you build the case?",
            followUpHints: ["What research did you present?", "How did it impact the roadmap?"],
          },
        ],
        technical: [
          {
            category: "prioritization",
            text: "Walk me through how you prioritize a backlog of 50+ features with competing business goals. What frameworks do you use?",
            followUpHints: ["How do you incorporate technical debt?", "How do you communicate trade-offs?"],
          },
          {
            category: "data-driven",
            text: "How do you measure the success of a feature after launch? What metrics matter most to you?",
            followUpHints: ["How do you define leading vs lagging indicators?", "What if the data is inconclusive?"],
          },
          {
            category: "roadmap-planning",
            text: "Describe your approach to quarterly roadmap planning. How do you balance long-term vision with short-term wins?",
            followUpHints: ["How do you handle scope creep?", "How often do you revise the roadmap?"],
          },
          {
            category: "discovery",
            text: "Walk me through your user research and discovery process for a new product initiative.",
            followUpHints: ["What methods do you use for validation?", "How do you know when you have enough data?"],
          },
          {
            category: "execution",
            text: "How do you work with engineering teams during sprint planning and execution? What's your communication cadence?",
            followUpHints: ["How do you handle missed estimates?", "What about technical dependencies?"],
          },
        ],
      },
      systemPrompt: `You are an experienced interviewer for a Product Manager position.

Your task: conduct a structured voice interview with 6 questions drawn from the question pack below.

Rules:
- Use the provided question pack — select questions strategically based on the candidate's previous answers
- Ask 3-4 role-specific questions and 2-3 behavioral questions, interleaving them naturally
- Include at least 2 follow-ups that reference the candidate's specific previous answers
- Keep spoken responses under 30 words — conversational and natural
- Ask exactly ONE question per response
- On question 6, signal it's the final question

Output must be valid JSON with this exact schema:
{
  "thought_process": "Your internal reasoning for choosing this question",
  "skills_detected": ["skill1", "skill2"],
  "spoken_response": "The question text to speak to the candidate"
}`,
    },
  ];

  for (const job of jobs) {
    await prisma.job.upsert({
      where: { id: job.id },
      update: {
        title: job.title,
        description: job.description,
        systemPrompt: job.systemPrompt,
        questionPack: job.questionPack,
        maxDurationSeconds: job.maxDurationSeconds,
        isPublished: true,
      },
      create: job,
    });
  }

  console.log("Seeded 3 jobs successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
