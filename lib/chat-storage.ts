export interface ChatSession {
    id: string;
    title: string;
    messages: any[];
    createdAt: number;
}

const STORAGE_KEY = "road_demo_chat_history";

export const chatStorage = {
    getSessions: (): ChatSession[] => {
        if (typeof window === "undefined") return [];
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },
    saveSession: (session: ChatSession) => {
        const sessions = chatStorage.getSessions();
        const index = sessions.findIndex(s => s.id === session.id);
        if (index > -1) {
            sessions[index] = session;
        } else {
            sessions.unshift(session);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    },
    deleteSession: (id: string) => {
        const sessions = chatStorage.getSessions().filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    },
    clearAll: () => {
        localStorage.removeItem(STORAGE_KEY);
    }
};
