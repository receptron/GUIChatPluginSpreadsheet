<template>
  <div class="max-w-4xl mx-auto">
    <h1 class="text-gray-800 mb-8">{{ pluginName }} Demo</h1>

    <!-- Sample Selector Section -->
    <div class="bg-white rounded-lg p-5 mb-5 shadow-md">
      <h2 class="text-gray-600 text-xl mb-4">Sample Data</h2>
      <div v-if="samplesList.length > 0" class="flex flex-wrap gap-2 mb-3">
        <button
          v-for="(sample, index) in samplesList"
          :key="index"
          @click="loadSample(sample)"
          class="py-2 px-4 bg-green-100 border border-green-200 rounded-md cursor-pointer text-sm text-green-700 transition-all hover:bg-green-200 hover:border-green-300"
        >
          {{ sample.name }}
        </button>
      </div>
    </div>

    <!-- View Component -->
    <div v-if="ViewComponent" class="bg-white rounded-lg p-5 mb-5 shadow-md">
      <h2 class="text-gray-600 text-xl mb-4">View Component</h2>
      <div class="border border-gray-200 rounded h-[600px]">
        <component
          :is="ViewComponent"
          :selectedResult="result"
          :sendTextMessage="handleSendTextMessage"
          @updateResult="handleUpdate"
        />
      </div>
    </div>

    <!-- Preview Component -->
    <div v-if="PreviewComponent" class="bg-white rounded-lg p-5 mb-5 shadow-md">
      <h2 class="text-gray-600 text-xl mb-4">Preview Component</h2>
      <div class="max-w-[200px]">
        <component :is="PreviewComponent" :result="result" />
      </div>
    </div>

    <!-- Current Result Data -->
    <div class="bg-white rounded-lg p-5 mb-5 shadow-md">
      <h2 class="text-gray-600 text-xl mb-4">Current Result Data</h2>
      <pre class="bg-gray-100 p-3 rounded overflow-x-auto text-xs max-h-64 overflow-y-auto">{{ resultPreview }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { plugin } from "../src/vue";
import type { ToolResult, ToolSample, ToolPlugin } from "gui-chat-protocol/vue";
import type { SpreadsheetToolData } from "../src/core/types";

// Plugin configuration - cast to base ToolPlugin for generic demo usage
const currentPlugin = plugin as unknown as ToolPlugin;

// Computed properties from plugin
const pluginName = computed(() => currentPlugin.toolDefinition.name);
const toolName = computed(() => currentPlugin.toolDefinition.name);
const samplesList = computed(() => currentPlugin.samples || []);
const ViewComponent = computed(() => currentPlugin.viewComponent);
const PreviewComponent = computed(() => currentPlugin.previewComponent);

// State
const result = ref<ToolResult<SpreadsheetToolData>>({
  toolName: toolName.value,
  uuid: "demo-uuid-123",
  message: "Ready",
  title: "",
  data: undefined,
});

// Truncate data for display
const resultPreview = computed(() => {
  const preview = { ...result.value };
  if (preview.data?.sheets) {
    // Show first sheet's first few rows only
    const truncatedSheets = preview.data.sheets.map((sheet) => ({
      name: sheet.name,
      data: sheet.data.slice(0, 5).map((row) => row.slice(0, 5)),
      _truncated: sheet.data.length > 5 ? `... (${sheet.data.length} rows total)` : undefined,
    }));
    return JSON.stringify({ ...preview, data: { sheets: truncatedSheets } }, null, 2);
  }
  return JSON.stringify(preview, null, 2);
});

// Actions
const loadSample = (sample: ToolSample) => {
  const args = sample.args as { title: string; sheets: SpreadsheetToolData["sheets"] };
  result.value = {
    toolName: toolName.value,
    uuid: `demo-${Date.now()}`,
    message: `Loaded: ${sample.name}`,
    title: args.title || sample.name,
    data: { sheets: args.sheets },
  };
};

const handleSendTextMessage = (text?: string) => {
  console.log("sendTextMessage called:", text);
};

const handleUpdate = (updated: ToolResult<SpreadsheetToolData>) => {
  result.value = updated;
  console.log("Result updated:", updated);
};

// Load first sample on mount
onMounted(() => {
  if (samplesList.value.length > 0) {
    loadSample(samplesList.value[0]);
  }
});
</script>
