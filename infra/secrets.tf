# Secrets the tracker Lambda needs. Generated once by Terraform and passed to every
# Lambda instance as environment variables (see local.env_vars in locals.tf), so all
# instances agree: a key "generated on first run" would differ per instance.

# Signs login tokens (HS256). Changing it signs everyone out.
resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

# Password of the first admin account, AD000001, created on the first cold start.
# It must be changed at first login. Read it with:
#   terraform -chdir=infra output -raw bootstrap_admin_password
resource "random_password" "bootstrap_admin" {
  length  = 16
  special = false
}
