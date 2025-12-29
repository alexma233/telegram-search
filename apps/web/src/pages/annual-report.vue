<script setup lang="ts">
import { useAnnualReportStore } from '@tg-search/client'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Card from '../components/ui/Card.vue'

import { Button } from '../components/ui/Button'

const { t } = useI18n()
const annualReportStore = useAnnualReportStore()
const { stats, isFetching } = storeToRefs(annualReportStore)

const selectedYear = ref(new Date().getFullYear())
const years = computed(() => {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 5 }, (_, i) => currentYear - i)
})

function handleGenerate() {
  annualReportStore.fetchAnnualReport(selectedYear.value)
}

const maxMonth = computed(() => {
  if (!stats.value)
    return null
  return [...stats.value.monthlyStats].sort((a, b) => b.messageCount - a.messageCount)[0]
})
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <header class="flex items-center justify-between border-b bg-card/50 px-6 py-4 backdrop-blur-sm">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold">
          {{ t('annualReport.annualReport') }}
        </h1>
      </div>

      <div class="flex items-center gap-4">
        <select
          v-model="selectedYear"
          class="h-9 border border-input rounded-md bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring"
        >
          <option v-for="year in years" :key="year" :value="year">
            {{ year }}
          </option>
        </select>
        <Button
          icon="i-lucide-sparkles"
          :loading="isFetching"
          @click="handleGenerate"
        >
          {{ t('annualReport.generate', { year: selectedYear }) }}
        </Button>
      </div>
    </header>

    <div class="flex-1 overflow-auto p-6">
      <div class="mx-auto max-w-4xl space-y-8">
        <div v-if="isFetching" class="flex flex-col items-center justify-center py-20 text-center">
          <div class="i-lucide-loader-2 mb-4 h-12 w-12 animate-spin text-primary" />
          <h2 class="text-2xl font-bold">
            {{ t('annualReport.generating') }}
          </h2>
          <p class="mt-2 text-muted-foreground">
            {{ t('annualReport.generatingDescription') }}
          </p>
        </div>

        <template v-else-if="stats">
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card class="bg-linear-to-br flex flex-col items-center justify-center border-primary/20 from-primary/10 to-transparent p-8 text-center">
              <div class="i-lucide-message-square mb-4 h-16 w-16 text-primary" />
              <div class="text-5xl text-primary font-black">
                {{ stats.totalMessagesSent.toLocaleString() }}
              </div>
              <div class="mt-2 text-lg text-muted-foreground font-medium">
                {{ t('annualReport.messagesSent') }}
              </div>
            </Card>

            <Card v-if="maxMonth" class="flex flex-col items-center justify-center p-8 text-center">
              <div class="i-lucide-calendar-days mb-4 h-16 w-16 text-orange-500" />
              <div class="text-4xl font-bold">
                {{ t('annualReport.mostActiveIn', { month: maxMonth.month }) }}
              </div>
              <div class="mt-2 text-muted-foreground">
                {{ maxMonth.messageCount.toLocaleString() }} {{ t('annualReport.messagesSent') }}
              </div>
            </Card>
          </div>

          <Card class="p-6">
            <h3 class="mb-6 text-xl font-bold">
              {{ t('annualReport.monthlyActivity') }}
            </h3>
            <div class="h-64 flex items-end justify-between gap-2 pt-8">
              <div
                v-for="s in stats.monthlyStats"
                :key="s.month"
                class="group relative flex flex-1 flex-col items-center"
              >
                <div
                  class="w-full rounded-t-sm bg-primary/60 transition-all hover:bg-primary"
                  :style="{ height: `${(s.messageCount / (maxMonth?.messageCount || 1)) * 100}%` }"
                >
                  <div class="absolute bottom-full mb-2 w-max rounded bg-black px-2 py-1 text-xs text-white hidden group-hover:block">
                    {{ s.messageCount }}
                  </div>
                </div>
                <div class="mt-2 text-xs text-muted-foreground">
                  {{ s.month }}
                </div>
              </div>
            </div>
          </Card>

          <Card class="p-6">
            <h3 class="mb-6 text-xl font-bold">
              {{ t('annualReport.topChats') }}
            </h3>
            <div class="space-y-4">
              <div
                v-for="(chat, index) in stats.topChats"
                :key="chat.chatId"
                class="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-accent/50"
              >
                <div class="flex items-center gap-4">
                  <div class="h-10 w-10 flex items-center justify-center rounded-full bg-muted font-bold">
                    {{ index + 1 }}
                  </div>
                  <div>
                    <div class="font-bold">
                      {{ chat.chatName }}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      ID: {{ chat.chatId }}
                    </div>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-primary font-black">
                    {{ chat.messageCount }}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    messages
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </template>

        <div v-else class="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <div class="i-lucide-sparkles mb-4 h-16 w-16 opacity-20" />
          <h2 class="text-xl font-medium">
            {{ t('annualReport.selectYear') }}
          </h2>
          <p class="mt-1">
            Click generate to look back at your Telegram journey.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
