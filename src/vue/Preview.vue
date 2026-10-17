<template>
  <div class="p-2 bg-green-50 dark:bg-green-900 rounded">
    <div class="text-sm text-gray-800 dark:text-gray-200 font-medium break-words">
      {{ displayTitle }}
    </div>
    <div v-if="sheetCount > 1" class="text-xs text-gray-600 dark:text-gray-400 mt-1">
      {{ t.sheetCount(sheetCount) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ToolResult } from "gui-chat-protocol";
import type { SpreadsheetToolData } from "../core/types";
import { useT } from "../lang";

const t = useT();

const props = defineProps<{
  result: ToolResult<SpreadsheetToolData>;
}>();

const displayTitle = computed(() => props.result.title || t.value.untitled);

// A file-backed result carries a path, so its sheet count is not known here.
const sheetCount = computed(() => {
  const sheets = props.result.data?.sheets;
  if (!sheets || typeof sheets === "string") return 0;
  return sheets.length;
});
</script>
