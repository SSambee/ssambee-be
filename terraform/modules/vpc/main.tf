// aws 제공자가 실제 사용 가능한 가용 영역 목록을 동적으로 가져올수있습니다.
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "lms_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  tags                 = { Name = "${var.env}-vpc" }
}

resource "aws_internet_gateway" "lms_igw" {
  vpc_id = aws_vpc.lms_vpc.id
  tags   = { Name = "${var.env}-igw" }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.lms_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.lms_igw.id
  }
  tags = { Name = "${var.env}-public-rt" }
}

resource "aws_subnet" "public_subnet" {
  vpc_id                  = aws_vpc.lms_vpc.id
  cidr_block              = var.public_subnet_1_cidr
  map_public_ip_on_launch = true
  availability_zone       = data.aws_availability_zones.available.names[0]
  tags                    = { Name = "${var.env}-public-sn-1" }
}

resource "aws_subnet" "public_subnet_2" {
  vpc_id                  = aws_vpc.lms_vpc.id
  cidr_block              = var.public_subnet_2_cidr
  map_public_ip_on_launch = true
  availability_zone       = data.aws_availability_zones.available.names[1]
  tags                    = { Name = "${var.env}-public-sn-2" }
}

resource "aws_route_table_association" "public_1_assoc" {
  subnet_id      = aws_subnet.public_subnet.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "public_2_assoc" {
  subnet_id      = aws_subnet.public_subnet_2.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_subnet" "private_subnet" {
  vpc_id            = aws_vpc.lms_vpc.id
  cidr_block        = var.private_subnet_1_cidr
  availability_zone = data.aws_availability_zones.available.names[0]
  tags              = { Name = "${var.env}-private-sn-1" }
}

resource "aws_subnet" "private_subnet_2" {
  vpc_id            = aws_vpc.lms_vpc.id
  cidr_block        = var.private_subnet_2_cidr
  availability_zone = data.aws_availability_zones.available.names[1]
  tags              = { Name = "${var.env}-private-sn-2" }
}
