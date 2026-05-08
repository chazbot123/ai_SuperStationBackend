import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AiModule } from './modules/ai/ai.module';
import { AgentsModule } from './modules/agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomerManagementModule } from './modules/customer-management/customer-management.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ProductsModule } from './modules/products/products.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RulesModule } from './modules/rules/rules.module';
import { SupportModule } from './modules/support/support.module';
import { SuperSiteSettingsModule } from './modules/super-site-settings/super-site-settings.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    AiModule,
    PrismaModule,
    AuthModule,
    AgentsModule,
    KnowledgeModule,
    PublishingModule,
    ProductsModule,
    CustomerManagementModule,
    RbacModule,
    RulesModule,
    SupportModule,
    SuperSiteSettingsModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
