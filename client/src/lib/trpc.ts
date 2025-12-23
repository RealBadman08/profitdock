// import { createTRPCReact } from "@trpc/react-query";
// import type { AppRouter } from "../../../server/routers";

// Mock TRPC to decouple client from server build
const mockQuery = () => ({ data: null, isLoading: false, error: null });
const mockMutation = () => ({ mutate: () => { }, mutateAsync: async () => { }, isLoading: false });

export const trpc: any = {
    createClient: () => ({
        links: []
    }),
    Provider: ({ children }: any) => children,
    useUtils: () => ({
        invalidate: () => { },
        botSessions: { list: { invalidate: () => { } } }
    }),
    auth: {
        me: { useQuery: mockQuery },
        logout: { useMutation: mockMutation }
    },
    botSessions: {
        list: { useQuery: () => ({ data: [], isLoading: false }) },
        create: { useMutation: mockMutation },
        update: { useMutation: mockMutation }
    },
    trades: {
        record: { useMutation: mockMutation }
    },
    ai: {
        chat: { useMutation: mockMutation }
    }
};
