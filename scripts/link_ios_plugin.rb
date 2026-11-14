#!/usr/bin/env ruby
# scripts/link_ios_plugin.rb
# Automatically registers JamshNearby native plugin files into the Xcode project.

require 'fileutils'

begin
  require 'xcodeproj'
rescue LoadError
  puts "Installing xcodeproj gem..."
  system('gem install xcodeproj --no-document')
  require 'xcodeproj'
end

project_dir = File.expand_path('../ios/App', __dir__)
project_path = File.join(project_dir, 'App.xcodeproj')
app_folder = File.join(project_dir, 'App')
custom_src_dir = File.expand_path('../ios-custom', __dir__)

unless File.exist?(project_path)
  abort "Error: Xcode project not found at #{project_path}"
end

puts "==> Opening Xcode project at #{project_path}..."
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == 'App' }

unless target
  abort "Error: 'App' target not found in #{project_path}"
end

app_group = project.main_group.find_subpath('App', true)

plugin_files = ['JamshNearbyPlugin.swift', 'JamshNearbyPlugin.m']

plugin_files.each do |filename|
  target_file_path = File.join(app_folder, filename)
  source_file_path = File.join(custom_src_dir, filename)

  # Copy file to App folder if not already there
  if !File.exist?(target_file_path) && File.exist?(source_file_path)
    FileUtils.cp(source_file_path, target_file_path)
    puts "Copied #{filename} to #{target_file_path}"
  end

  # Check if reference already exists in group
  existing_ref = app_group.files.find { |f| f.path == filename || f.name == filename }

  unless existing_ref
    file_ref = app_group.new_reference(filename)
    target.source_build_phase.add_file_reference(file_ref)
    puts "Successfully linked #{filename} to App target compile sources."
  else
    # Ensure it's in target sources phase
    unless target.source_build_phase.files.any? { |bf| bf.file_ref == existing_ref }
      target.source_build_phase.add_file_reference(existing_ref)
      puts "Added existing #{filename} reference to target source build phase."
    else
      puts "#{filename} is already linked to App target."
    end
  end
end

project.save
puts "==> Successfully saved Xcode project configuration!"
