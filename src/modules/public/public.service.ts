import { prisma } from '../../lib/prisma'

export async function getPublicStats() {
  const [hospitals, ambulancesAvailable, requestsCompleted] = await prisma.$transaction([
    prisma.hospital.count({ where: { deletedAt: null } }),
    prisma.ambulance.count({ where: { status: 'AVAILABLE', deletedAt: null } }),
    prisma.emergencyRequest.count({ where: { status: 'COMPLETED' } }),
  ])
  return { hospitals, ambulancesAvailable, requestsCompleted }
}
