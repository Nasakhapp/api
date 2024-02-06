import prisma from "./db/prisma";

const firstNames = [
  "هاشم",
  "ممرض",
  "ممد",
  "گونی",
  "گوساله",
  "گلابی",
  "فاطی",
  "سلطون علی",
  "توله",
  "تخم سگ",
  "پنبه",
  "بزمجه",
  "آبدزدک",
];

const lastNames = [
  "کماندو",
  "شیشه ای",
  "جوبیان",
  "سیگاری",
  "خراب",
  "هاپوزاده",
  "خر",
  "دزده",
  "اوبی تبار",
  "تو روغن",
];

const main = async () => {
  await prisma.firstName.deleteMany({});
  await prisma.lastName.deleteMany({});
  await prisma.firstName.createMany({
    data: firstNames.map((item) => ({ name: item })),
  });
  await prisma.lastName.createMany({
    data: lastNames.map((item) => ({ name: item })),
  });
};

main().finally(() => prisma.$disconnect());
