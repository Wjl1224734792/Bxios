import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { cwd } from 'node:process';

/**
 * CLI 核心逻辑
 */
export async function runCli() {
  const args = process.argv.slice(2);
  const command = args[0];
  const moduleName = args[1];

  if (command !== 'generate' && command !== 'g') {
    showHelp();
    return;
  }

  if (!moduleName) {
    console.error('❌ 错误: 请指定模块名称');
    console.log('示例: bunx bunxios generate product');
    process.exit(1);
  }

  try {
    generateService(moduleName);
  } catch (error) {
    console.error('❌ 生成失败:', error);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Bunxios CLI 工具

用法:
  bunxios generate <module-name>
  bunxios g <module-name>

示例:
  bunxios generate user    -> 生成 src/modules/user/services/user.service.ts
`);
}

function generateService(name: string) {
  // 转换为帕斯卡命名 (User)
  const pascalName = name.charAt(0).toUpperCase() + name.slice(1);
  // 转换为短横线命名 (user) - 简单处理
  const kebabName = name.toLowerCase();

  const serviceTemplate = `import { HttpClient } from 'bunxios';

// TODO: 建议将此实例移至统一的配置文件中
const http = new HttpClient({
  baseURL: '/api'
});

export interface ${pascalName} {
  id: string;
  // TODO: 添加属性定义
  createdAt: string;
  updatedAt: string;
}

export class ${pascalName}Service {
  private baseUrl = '/${kebabName}';

  /**
   * 获取列表
   */
  async list(params?: any) {
    const response = await http.get<${pascalName}[]>(this.baseUrl, { params });
    return response.data;
  }

  /**
   * 获取详情
   */
  async get(id: string) {
    const response = await http.get<${pascalName}>(\`\${this.baseUrl}/\${id}\`);
    return response.data;
  }

  /**
   * 创建
   */
  async create(data: Partial<${pascalName}>) {
    const response = await http.post<${pascalName}>(this.baseUrl, data);
    return response.data;
  }

  /**
   * 更新
   */
  async update(id: string, data: Partial<${pascalName}>) {
    const response = await http.put<${pascalName}>(\`\${this.baseUrl}/\${id}\`, data);
    return response.data;
  }

  /**
   * 删除
   */
  async delete(id: string) {
    await http.delete(\`\${this.baseUrl}/\${id}\`);
  }
}

export const ${name}Service = new ${pascalName}Service();
`;

  // 目标路径: src/modules/<name>/services/<name>.service.ts
  const targetDir = join(cwd(), 'src', 'modules', kebabName, 'services');
  const targetFile = join(targetDir, `${kebabName}.service.ts`);

  console.log(`🔨 正在生成 ${pascalName} 模块...`);

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  if (existsSync(targetFile)) {
    console.error(`⚠️ 文件已存在: ${targetFile}`);
    process.exit(1);
  }

  writeFileSync(targetFile, serviceTemplate, 'utf-8');

  console.log(`✅ 成功生成 Service 文件:`);
  console.log(`   ${targetFile}`);
}

