import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
import { logger } from '../src/lib/logger'

config()

const prisma = new PrismaClient()

const DEMO_ADMIN_EMAIL = 'admin@dispatch.demo'
const DEMO_ADMIN_PASSWORD = 'Admin123!'

const hospitals = [
  {
    name: 'Dhaka Medical College Hospital',
    address: 'Secretariat Rd, Bakshibazar, Dhaka',
    lat: 23.7259,
    lng: 90.3973,
    phone: '+88029660000',
  },
  {
    name: 'Square Hospital',
    address: '18/F Bir Uttam Qazi Nuruzzaman Sarak, West Panthapath, Dhaka',
    lat: 23.7507,
    lng: 90.3898,
    phone: '+88028144666',
  },
  {
    name: 'United Hospital',
    address: 'Plot 15, Rd 2, Gulshan 2, Dhaka',
    lat: 23.7925,
    lng: 90.4148,
    phone: '+88028836000',
  },
]

const ambulances = [
  { plateNumber: 'DHK-1001', type: 'BASIC' as const },
  { plateNumber: 'DHK-2002', type: 'ICU' as const },
  { plateNumber: 'DHK-3003', type: 'CARDIAC' as const },
]

async function main() {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? DEMO_ADMIN_EMAIL
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? DEMO_ADMIN_PASSWORD

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Demo Admin',
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      phone: '+8801700000000',
      role: Role.ADMIN,
      isVerified: true,
    },
  })

  for (const [i, h] of hospitals.entries()) {
    const existing = await prisma.hospital.findFirst({ where: { name: h.name, deletedAt: null } })
    const hospital = existing ?? (await prisma.hospital.create({ data: h }))
    const a = ambulances[i]
    if (a) {
      await prisma.ambulance.upsert({
        where: { plateNumber: a.plateNumber },
        update: { homeHospitalId: hospital.id },
        create: { ...a, homeHospitalId: hospital.id },
      })
    }
  }

  logger.info(`Seed done. Admin: ${admin.email}`)
}

main()
  .catch((e) => {
    logger.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
