import { createUseT } from "gui-chat-protocol/vue";
import de from "./de";
import en from "./en";
import es from "./es";
import fr from "./fr";
import ja from "./ja";
import ko from "./ko";
import ptBR from "./ptBR";
import zh from "./zh";

// Keyed by the host's locale tag; English when the host provides no runtime.
const MESSAGES = { de, en, es, fr, ja, ko, "pt-BR": ptBR, zh };

export const useT = createUseT(MESSAGES);
