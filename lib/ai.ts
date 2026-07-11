import { profileCandidates, resolveCandidate } from './matcher';
import type { AiSettings, FieldDescriptor, FieldMatch, ResumeProfile } from './types';

type AiMappingResponse = {
  mappings?: Array<{
    fieldId?: string;
    profileKey?: string;
    confidence?: number;
    reason?: string;
  }>;
};

function parseJson(content: string): AiMappingResponse {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('模型没有返回 JSON 对象');
  return JSON.parse(cleaned.slice(start, end + 1)) as AiMappingResponse;
}

export async function mapAmbiguousFields(
  fields: FieldDescriptor[],
  profile: ResumeProfile,
  settings: AiSettings,
): Promise<FieldMatch[]> {
  if (!settings.enabled || !settings.apiKey || fields.length === 0) return [];

  const candidates = profileCandidates(profile).map(({ key, label, aliases, category, repeatIndex }) => ({
    key,
    label,
    aliases,
    category,
    repeatIndex,
  }));

  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是中文网申表单字段映射器。只判断网页字段应对应哪个简历字段，不生成或改写任何简历内容。返回 JSON：{"mappings":[{"fieldId":"...","profileKey":"...","confidence":0-100,"reason":"简短理由"}]}。无法确定的字段不要返回。重复经历必须根据 section 和 occurrence 选择正确索引。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            fields: fields.map(({ id, label, name, placeholder, section, type, options, occurrence }) => ({
              id,
              label,
              name,
              placeholder,
              section,
              type,
              options,
              occurrence,
            })),
            profileFields: candidates,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API 请求失败 (${response.status})：${message.slice(0, 240)}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回内容为空');
  const parsed = parseJson(content);
  const fieldMap = new Map(fields.map((field) => [field.id, field]));

  const matches: FieldMatch[] = [];
  for (const mapping of parsed.mappings ?? []) {
    if (!mapping.fieldId || !mapping.profileKey) continue;
    const field = fieldMap.get(mapping.fieldId);
    const candidate = resolveCandidate(profile, mapping.profileKey);
    const confidence = Math.max(0, Math.min(100, Number(mapping.confidence ?? 0)));
    if (!field || !candidate || confidence < 60) continue;
    matches.push({
      fieldId: field.id,
      profileKey: candidate.key,
      fieldLabel: field.label || field.placeholder || field.name || '未命名字段',
      profileLabel: candidate.label,
      value: candidate.value,
      confidence,
      source: 'ai',
      reason: mapping.reason?.slice(0, 80) || 'AI 语义映射',
    });
  }
  return matches;
}
