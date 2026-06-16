/**
 * Seed: one demo Organization with a CLIENT_OWNER user and a sample Contact + Lead.
 *
 * Idempotent — uses upserts keyed on stable natural/unique keys so re-running does
 * not create duplicates. Run with: `pnpm --filter @propulse/database seed`.
 *
 * NOTE: the seed uses the RAW PrismaClient (not forTenant) deliberately: it must
 * create the Organization (the tenant root, which is not tenant-scoped) and then
 * the tenant-scoped rows with explicit organizationId. In production, tenant-scoped
 * writes go through forTenant()/RLS — seeding is a privileged setup path.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_ORG_ID = 'org_demo_propulse';
const DEMO_OWNER_EMAIL = 'owner@demo.propulse.local';

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: DEMO_ORG_ID },
    update: { name: 'Demo Realty Co.' },
    create: { id: DEMO_ORG_ID, name: 'Demo Realty Co.', status: 'ACTIVE' },
  });

  const owner = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: DEMO_OWNER_EMAIL } },
    update: { role: 'CLIENT_OWNER', status: 'ACTIVE' },
    create: {
      organizationId: org.id,
      email: DEMO_OWNER_EMAIL,
      role: 'CLIENT_OWNER',
      status: 'ACTIVE',
    },
  });

  // Contact has no natural unique key in this slice; use a deterministic id so the
  // seed stays idempotent.
  const contact = await prisma.contact.upsert({
    where: { id: 'contact_demo_jane' },
    update: { fullName: 'Jane Prospect' },
    create: {
      id: 'contact_demo_jane',
      organizationId: org.id,
      fullName: 'Jane Prospect',
      phone: '+919876543210',
      email: 'jane.prospect@example.com',
    },
  });

  await prisma.lead.upsert({
    where: { id: 'lead_demo_jane' },
    update: { stage: 'QUALIFIED', score: 72, assignedToUserId: owner.id },
    create: {
      id: 'lead_demo_jane',
      organizationId: org.id,
      contactId: contact.id,
      stage: 'QUALIFIED',
      score: 72,
      source: 'WebsiteChat',
      assignedToUserId: owner.id,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded organization "${org.name}" (${org.id}) with demo owner, contact and lead.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
